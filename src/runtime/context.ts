/**
 * Context system: lexical scope + render-time snapshots
 *
 * CORE SEMANTIC (Option A — Snapshot-Based):
 * ============================================
 * An async resource observes the context of the render that created it.
 * Context changes only take effect via re-render, not magically mid-await.
 *
 * This ensures:
 * - Deterministic behavior
 * - Concurrency safety
 * - Replayable execution
 * - Debuggability
 *
 * INVARIANTS:
 * - readScope() only works during component render (has currentContextFrame)
 * - Each render captures a context snapshot
 * - Async continuations see the snapshot from render start (frozen)
 * - Provider (Scope) creates a new frame that shadows parent
 * - Context updates require re-render to take effect
 */

import type { JSXElement } from '../common/jsx';
import { ELEMENT_TYPE, STATIC_CHILDREN } from '../common/jsx';
import type { Props } from '../common/props';
import type { RenderableChild } from '../common/vnode';
import { getCurrentComponentInstance } from './component';
import type { ComponentInstance } from './component';
import {
  markEagerControlPrimitive,
  markTransparentComponentResult,
} from '../common/control';

export type ContextKey = symbol;

const TransparentContextScopeComponent = markTransparentComponentResult(
  ContextScopeComponent
);

type Renderable = RenderableChild;
type ContextScopeChildren = Renderable | (() => Renderable);

export interface Scope<T> {
  (props: { value: T; children?: ContextScopeChildren }): JSXElement;
  readonly key: ContextKey;
  readonly defaultValue: T;
}

export interface ContextFrame {
  parent: ContextFrame | null;
  // Lazily allocate `values` Map only when a provider sets values or a read occurs.
  values: Map<ContextKey, unknown> | null;
}

/** @internal Compare immutable context snapshots by provider identity and value. */
export function haveEquivalentContextFrames(
  left: ContextFrame | null,
  right: ContextFrame | null
): boolean {
  let leftFrame = left;
  let rightFrame = right;

  while (true) {
    while (leftFrame && !leftFrame.values?.size) {
      leftFrame = leftFrame.parent;
    }
    while (rightFrame && !rightFrame.values?.size) {
      rightFrame = rightFrame.parent;
    }

    if (leftFrame === rightFrame) {
      return true;
    }
    if (!leftFrame || !rightFrame) {
      return false;
    }

    const leftValues = leftFrame.values;
    const rightValues = rightFrame.values;
    if (leftValues?.size !== rightValues?.size) {
      return false;
    }
    if (leftValues) {
      if (!rightValues) {
        return false;
      }
      for (const [key, value] of leftValues) {
        if (!rightValues.has(key) || !Object.is(rightValues.get(key), value)) {
          return false;
        }
      }
    }

    leftFrame = leftFrame.parent;
    rightFrame = rightFrame.parent;
  }
}

const ROOT_EXECUTION_FRAME: ContextFrame = {
  parent: null,
  values: null,
};
const executionFramesByParent = new WeakMap<ContextFrame, ContextFrame>();

/** @internal Reuse immutable empty wrappers for the same provider snapshot. */
export function getExecutionContextFrame(
  parent: ContextFrame | null
): ContextFrame {
  if (!parent) {
    return ROOT_EXECUTION_FRAME;
  }

  let frame = executionFramesByParent.get(parent);
  if (!frame) {
    frame = { parent, values: null };
    executionFramesByParent.set(parent, frame);
  }
  return frame;
}

// Symbol to mark vnodes that need frame restoration
export const CONTEXT_FRAME_SYMBOL = Symbol('__tempoContextFrame__');

type ContextFrameCarrier = {
  [CONTEXT_FRAME_SYMBOL]?: ContextFrame;
};

const vnodeContextFrames = new WeakMap<object, ContextFrame>();

export function getVNodeContextFrame(node: unknown): ContextFrame | undefined {
  if (typeof node !== 'object' || node === null) {
    return undefined;
  }

  const objectNode = node as ContextFrameCarrier;
  return vnodeContextFrames.get(node) ?? objectNode[CONTEXT_FRAME_SYMBOL];
}

export function markVNodeWithContextFrame(
  node: unknown,
  frame: ContextFrame,
  overwrite = false
): void {
  if (typeof node !== 'object' || node === null) {
    return;
  }

  if (!overwrite && getVNodeContextFrame(node)) {
    return;
  }

  const objectNode = node as ContextFrameCarrier;
  if (Object.prototype.hasOwnProperty.call(node, CONTEXT_FRAME_SYMBOL)) {
    try {
      objectNode[CONTEXT_FRAME_SYMBOL] = frame;
      return;
    } catch {
      // Fall through to WeakMap metadata when the symbol slot is readonly.
    }
  }

  if (Object.isExtensible(node)) {
    try {
      Object.defineProperty(node, CONTEXT_FRAME_SYMBOL, {
        value: frame,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return;
    } catch {
      // Fall through to WeakMap metadata for exotic objects/proxies.
    }
  }

  vnodeContextFrames.set(node, frame);
}

function isVNodeLike(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const objectValue = value as Record<string | symbol, unknown>;
  if (objectValue.$$typeof === ELEMENT_TYPE) {
    return true;
  }

  return (
    'type' in objectValue &&
    ('props' in objectValue || 'children' in objectValue)
  );
}

function markContextPropValue(
  value: unknown,
  frame: ContextFrame,
  overwrite: boolean
): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      markContextPropValue(item, frame, overwrite);
    }
    return;
  }

  if (isVNodeLike(value)) {
    markVNodeTreeWithContextFrame(value, frame, overwrite);
  }
}

export function markVNodeTreeWithContextFrame(
  node: unknown,
  frame: ContextFrame | null,
  overwrite = false
): unknown {
  if (!frame) return node;

  if (Array.isArray(node)) {
    for (const child of node) {
      markVNodeTreeWithContextFrame(child, frame, overwrite);
    }
    return node;
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  markVNodeWithContextFrame(node, frame, overwrite);

  const objectNode = node as Record<string | symbol, unknown>;
  const props =
    typeof objectNode.props === 'object' && objectNode.props !== null
      ? (objectNode.props as Record<string, unknown>)
      : null;
  const children = (props?.children ?? objectNode.children) as unknown;

  if (Array.isArray(children)) {
    for (const child of children) {
      markVNodeTreeWithContextFrame(child, frame, overwrite);
    }
  } else if (children) {
    markVNodeTreeWithContextFrame(children, frame, overwrite);
  }

  if (props) {
    for (const key in props) {
      if (key !== 'children') {
        markContextPropValue(props[key], frame, overwrite);
      }
    }
  }

  return node;
}

function isContextFrameDescendantOf(
  frame: ContextFrame,
  ancestor: ContextFrame
): boolean {
  let current: ContextFrame | null = frame;
  while (current) {
    if (current === ancestor) {
      return true;
    }
    current = current.parent;
  }
  return false;
}

function rebaseContextFrame(
  frame: ContextFrame,
  previousOwnerFrame: ContextFrame | null,
  ownerFrame: ContextFrame
): ContextFrame {
  if (isContextFrameDescendantOf(frame, ownerFrame)) {
    return frame;
  }
  if (
    !previousOwnerFrame ||
    !isContextFrameDescendantOf(frame, previousOwnerFrame)
  ) {
    return ownerFrame;
  }

  const nestedFrames: ContextFrame[] = [];
  let current: ContextFrame | null = frame;
  while (current && current !== previousOwnerFrame) {
    nestedFrames.push(current);
    current = current.parent;
  }

  let rebasedFrame = ownerFrame;
  for (let index = nestedFrames.length - 1; index >= 0; index -= 1) {
    const nestedFrame = nestedFrames[index]!;
    rebasedFrame = {
      parent: rebasedFrame,
      values: nestedFrame.values ? new Map(nestedFrame.values) : null,
    };
  }
  return rebasedFrame;
}

/**
 * Stamp a child-scope result with its current owner while retaining frames
 * introduced by providers nested beneath that owner. Frames from an unrelated
 * or previous owner are rebased so reused vnodes cannot keep stale context.
 */
export function rebaseVNodeTreeWithContextFrame(
  node: unknown,
  ownerFrame: ContextFrame | null,
  previousOwnerFrame: ContextFrame | null = null
): unknown {
  if (!ownerFrame) return node;

  if (Array.isArray(node)) {
    for (const child of node) {
      rebaseVNodeTreeWithContextFrame(child, ownerFrame, previousOwnerFrame);
    }
    return node;
  }

  if (typeof node !== 'object' || node === null) {
    return node;
  }

  const existingFrame = getVNodeContextFrame(node);
  const inheritedFrame = existingFrame
    ? rebaseContextFrame(existingFrame, previousOwnerFrame, ownerFrame)
    : ownerFrame;
  markVNodeWithContextFrame(node, inheritedFrame, true);
  const inheritedPreviousFrame = existingFrame ?? previousOwnerFrame;

  const objectNode = node as Record<string | symbol, unknown>;
  const props =
    typeof objectNode.props === 'object' && objectNode.props !== null
      ? (objectNode.props as Record<string, unknown>)
      : null;
  const children = (props?.children ?? objectNode.children) as unknown;

  if (Array.isArray(children)) {
    for (const child of children) {
      rebaseVNodeTreeWithContextFrame(
        child,
        inheritedFrame,
        inheritedPreviousFrame
      );
    }
  } else if (children) {
    rebaseVNodeTreeWithContextFrame(
      children,
      inheritedFrame,
      inheritedPreviousFrame
    );
  }

  if (props) {
    for (const key in props) {
      if (key !== 'children') {
        const value = props[key];
        if (Array.isArray(value)) {
          for (const item of value) {
            if (isVNodeLike(item)) {
              rebaseVNodeTreeWithContextFrame(
                item,
                inheritedFrame,
                inheritedPreviousFrame
              );
            }
          }
        } else if (isVNodeLike(value)) {
          rebaseVNodeTreeWithContextFrame(
            value,
            inheritedFrame,
            inheritedPreviousFrame
          );
        }
      }
    }
  }

  return node;
}

// Global context frame stack (maintained during render)
// INVARIANT: Must NEVER be non-null across an await boundary
let currentContextFrame: ContextFrame | null = null;

// Async resource frame (maintained during async resource execution)
// INVARIANT: Set only for synchronous execution steps, cleared in finally
// This allows async resources to access their frozen render-time snapshot
let currentAsyncResourceFrame: ContextFrame | null = null;

/**
 * Execute a function within a specific context frame.
 *
 * CORE PRIMITIVE for context restoration:
 * - Saves the current context
 * - Sets the provided frame as current
 * - Executes the function
 * - Restores the previous context in finally
 *
 * This ensures no context frame remains globally active across await.
 */
export function withContext<T>(frame: ContextFrame | null, fn: () => T): T {
  const oldFrame = currentContextFrame;
  currentContextFrame = frame;
  try {
    return fn();
  } finally {
    currentContextFrame = oldFrame;
  }
}

/** @internal Invoke a two-argument function without allocating a wrapper. */
export function callWithContext<TArgs, TContext, TResult>(
  frame: ContextFrame | null,
  fn: (args: TArgs, context: TContext) => TResult,
  args: TArgs,
  context: TContext
): TResult {
  const oldFrame = currentContextFrame;
  currentContextFrame = frame;
  try {
    return fn(args, context);
  } finally {
    currentContextFrame = oldFrame;
  }
}

/**
 * Execute an async resource step within its frozen context snapshot.
 *
 * CRITICAL: This wrapper is applied only to synchronous execution steps of
 * an async resource (the initial call). We intentionally DO NOT restore
 * the resource frame for post-await continuations — continuations must not
 * observe or rely on a live resource frame. This keeps semantics simple and
 * deterministic: async resources see only their creation-time snapshot.
 */
export function withAsyncResourceContext<T>(
  frame: ContextFrame | null,
  fn: () => T
): T {
  const oldFrame = currentAsyncResourceFrame;
  // Only set the frame for the synchronous execution step
  currentAsyncResourceFrame = frame;
  try {
    return fn();
  } finally {
    // Clear the frame to avoid exposing it across await boundaries
    currentAsyncResourceFrame = oldFrame;
  }
}

export function defineScope<T>(defaultValue: T): Scope<T> {
  const key = Symbol('AskrContext');
  const scope = markEagerControlPrimitive(
    (props: { value: T; children?: ContextScopeChildren }): JSXElement =>
      ({
        $$typeof: ELEMENT_TYPE,
        type: TransparentContextScopeComponent,
        props: { key, value: props.value, children: props.children },
        key: null,
      }) as JSXElement
  );

  return Object.assign(scope, { key, defaultValue });
}

function preserveStaticChildrenMarker(
  source: readonly unknown[],
  target: unknown[]
): unknown[] {
  if (
    (
      source as {
        [STATIC_CHILDREN]?: boolean;
      }
    )[STATIC_CHILDREN] === true
  ) {
    Object.defineProperty(target, STATIC_CHILDREN, {
      value: true,
      enumerable: false,
      configurable: true,
    });
  }

  return target;
}

function isPresentRenderable(
  value: Renderable | null | undefined
): value is Renderable {
  return value !== null && value !== undefined && value !== false;
}

export function readScope<T>(context: Scope<T>): T {
  // Check render frame first (components), then async resource frame (resources)
  const frame = currentContextFrame || currentAsyncResourceFrame;

  if (!frame) {
    throw new Error(
      'readScope() can only be called during component render or async resource execution. ' +
        'Ensure you are calling this from inside your component or resource function.'
    );
  }

  let current: ContextFrame | null = frame;
  while (current) {
    // `values` may be null when no provider has created it yet — treat as empty
    const values = current.values;
    if (values && values.has(context.key)) {
      return values.get(context.key) as T;
    }
    current = current.parent;
  }
  return context.defaultValue;
}

/**
 * Internal component that manages context frame
 * Used by a scope component to provide a shadowed value to its children.
 */
function ContextScopeComponent(props: Props): Renderable {
  // Extract expected properties (we accept a loose shape so this can be used as a component type)
  const key = props['key'] as ContextKey;
  const value = props['value'];
  const children = props['children'] as ContextScopeChildren;

  // Create a new frame with this value
  const instance = getCurrentComponentInstance();
  const parentFrame: ContextFrame | null = (() => {
    // Prefer the live render frame.
    // Note: the runtime executes component functions inside an empty "render frame"
    // whose parent points at the nearest provider chain. Even if this frame has no
    // values, it must still be used to preserve the parent linkage.
    if (currentContextFrame) return currentContextFrame;

    // If there is no live render frame (should be rare), fall back to the
    // instance's owner frame.
    if (instance && instance.ownerFrame) return instance.ownerFrame;

    // Do NOT fall back to the async snapshot stack here: that stack represents
    // unrelated async continuations and must not affect lexical provider chaining.
    return null;
  })();

  const newFrame: ContextFrame = {
    parent: parentFrame,
    values: new Map([[key, value]]),
  };

  // Helper: create a function-child invoker node (centralized cast)
  function createFunctionChildInvoker(
    fn: () => Renderable,
    frame: ContextFrame,
    owner: ComponentInstance | null
  ): Renderable {
    return {
      type: ContextFunctionChildInvoker,
      props: { fn, __frame: frame, __owner: owner },
    } as unknown as Renderable;
  }

  // The renderer will set ownerFrame on child component instances when they're created.
  // We mark vnodes with the frame so the renderer knows which frame to assign.
  if (Array.isArray(children)) {
    // Mark array elements with the frame. If an element is a function-child,
    // convert it into a lazy invoker so it's executed later inside the frame.
    return preserveStaticChildrenMarker(
      children,
      children.map((child) => {
        if (typeof child === 'function') {
          return createFunctionChildInvoker(
            child as () => Renderable,
            newFrame,
            getCurrentComponentInstance()
          );
        }
        return markWithFrame(child, newFrame);
      })
    ) as unknown as Renderable;
  } else if (typeof children === 'function') {
    // If children is a function (render callback), do NOT execute it eagerly
    // during the parent render. Instead, return a small internal component
    // that will execute the function later (when it itself is rendered) and
    // will execute it within the provider frame so any reads performed during
    // that execution observe the provider's frame.
    return createFunctionChildInvoker(
      children as () => Renderable,
      newFrame,
      getCurrentComponentInstance()
    );
  } else if (isPresentRenderable(children)) {
    return markWithFrame(children, newFrame);
  }

  return null;
}

/**
 * Internal: Mark a vnode with a context frame
 * The renderer will restore this frame before executing component functions
 */
function markWithFrame(node: Renderable, frame: ContextFrame): Renderable {
  return markVNodeTreeWithContextFrame(node, frame, true) as Renderable;
}

/**
 * Internal helper component: executes a function-child lazily inside the
 * provided frame and marks the returned subtree with that frame so later
 * component executions will restore the correct context frame.
 *
 * SNAPSHOT SEMANTIC: The frame passed here is the snapshot captured at render
 * time. Any resources created during this execution will observe this frozen
 * snapshot, ensuring deterministic behavior.
 */
function ContextFunctionChildInvoker(props: {
  fn: () => Renderable;
  __frame: ContextFrame;
  __owner?: ComponentInstance | null;
}): Renderable {
  const { fn, __frame } = props;

  // Execute the function-child within the provider frame.
  // The owner's ownerFrame is already set by the renderer when the component was created.
  // Any resources started during this execution will capture this frame as their
  // snapshot, ensuring they see the context values from this render, not future renders.
  const res = withContext(__frame, () => fn());

  // Mark the result so the renderer knows to set ownerFrame on child instances
  if (isPresentRenderable(res)) return markWithFrame(res, __frame);
  return null;
}

/**
 * Push a new context frame (for render entry)
 * Called by component runtime when render starts
 */
export function pushContextFrame(): ContextFrame {
  // Lazily allocate the `values` map to avoid per-render allocations when
  // components do not use context. The map will be created when a provider
  // sets a value or when a read discovers no map and needs to behave as empty.
  const frame: ContextFrame = {
    parent: currentContextFrame,
    values: null,
  };
  currentContextFrame = frame;
  return frame;
}

/**
 * Pop context frame (for render exit)
 * Called by component runtime when render ends
 */
export function popContextFrame(): void {
  if (currentContextFrame) {
    currentContextFrame = currentContextFrame.parent;
  }
}

/**
 * Get the current context frame for inspection (used by tests/diagnostics only)
 */
export function getCurrentContextFrame(): ContextFrame | null {
  return currentContextFrame;
}

/**
 * Get the top of the context snapshot stack (used by runtime when deciding
 * how to link snapshots for async continuations). Returns null if stack empty.
 */
export function getTopContextSnapshot(): ContextFrame | null {
  return currentContextFrame;
}
