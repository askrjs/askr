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
 * - readContext() only works during component render (has currentContextFrame)
 * - Each render captures a context snapshot
 * - Async continuations see the snapshot from render start (frozen)
 * - Provider (Scope) creates a new frame that shadows parent
 * - Context updates require re-render to take effect
 */

import type { JSXElement } from '../jsx/types';
import type { Props } from '../shared/types';
import { getCurrentComponentInstance } from './component';

export type ContextKey = symbol;

// Lightweight VNode definition used for JSX typing in this module
type VNode = {
  type: string;
  props?: Record<string, unknown>;
  children?: (string | VNode | null | undefined | false)[];
};

// Union of allowed render return values (text, vnode, JSX element, etc.)
type Renderable =
  | JSXElement
  | VNode
  | string
  | number
  | null
  | undefined
  | false;

export interface Context<T> {
  readonly key: ContextKey;
  readonly defaultValue: T;
  // A Scope is a JSX-style element factory returning a JSXElement (component invocation)
  readonly Scope: (props: { value: T; children?: unknown }) => JSXElement;
}

export interface ContextFrame {
  parent: ContextFrame | null;
  // Lazily allocate `values` Map only when a provider sets values or a read occurs.
  values: Map<ContextKey, unknown> | null;
}

// Symbol to mark vnodes that need frame restoration
export const CONTEXT_FRAME_SYMBOL = Symbol('__tempoContextFrame__');

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

/**
 * Execute an async resource step within its frozen context snapshot.
 *
 * CRITICAL: This wrapper is applied to each synchronous execution step
 * of an async resource (before await, after await). The frame is never
 * held across await boundaries—it's set, fn executes, then it's cleared.
 *
 * This allows readContext() to work in async resources while maintaining
 * the invariant that no global frame remains active across await.
 */
export function withAsyncResourceContext<T>(
  frame: ContextFrame | null,
  fn: () => T
): T {
  const oldFrame = currentAsyncResourceFrame;
  currentAsyncResourceFrame = frame;
  try {
    return fn();
  } finally {
    currentAsyncResourceFrame = oldFrame;
  }
}

export function defineContext<T>(defaultValue: T): Context<T> {
  const key = Symbol('AskrContext');

  return {
    key,
    defaultValue,
    Scope: (props: { value: T; children?: unknown }): JSXElement => {
      // Scope component: creates a new frame and renders children within it
      return {
        type: ContextScopeComponent,
        props: { key, value: props.value, children: props.children },
      } as JSXElement;
    },
  };
}

export function readContext<T>(context: Context<T>): T {
  // Check render frame first (components), then async resource frame (resources)
  const frame = currentContextFrame || currentAsyncResourceFrame;

  if (!frame) {
    throw new Error(
      'readContext() can only be called during component render or async resource execution. ' +
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
 * Used by Context.Scope to provide shadowed value to children
 */
function ContextScopeComponent(props: Props): Renderable {
  // Extract expected properties (we accept a loose shape so this can be used as a component type)
  const key = props['key'] as ContextKey;
  const value = props['value'];
  const children = props['children'] as Renderable;

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

  // The renderer will set ownerFrame on child component instances when they're created.
  // We mark vnodes with the frame so the renderer knows which frame to assign.
  if (Array.isArray(children)) {
    // Mark array elements with the frame. If an element is a function-child,
    // convert it into a lazy invoker so it's executed later inside the frame.
    return children.map((child) => {
      if (typeof child === 'function') {
        return {
          type: ContextFunctionChildInvoker,
          props: {
            fn: child as () => Renderable,
            __frame: newFrame,
            __owner: getCurrentComponentInstance(),
          },
        } as unknown as Renderable;
      }
      return markWithFrame(child, newFrame);
    }) as unknown as Renderable;
  } else if (typeof children === 'function') {
    // If children is a function (render callback), do NOT execute it eagerly
    // during the parent render. Instead, return a small internal component
    // that will execute the function later (when it itself is rendered) and
    // will execute it within the provider frame so any reads performed during
    // that execution observe the provider's frame.
    return {
      type: ContextFunctionChildInvoker,
      props: {
        fn: children as () => Renderable,
        __frame: newFrame,
        __owner: getCurrentComponentInstance(),
      },
    } as unknown as Renderable;
  } else if (children) {
    return markWithFrame(children, newFrame);
  }

  return null;
}

/**
 * Internal: Mark a vnode with a context frame
 * The renderer will restore this frame before executing component functions
 */
function markWithFrame(node: Renderable, frame: ContextFrame): Renderable {
  // Recursively mark node and its subtree so nested provider/component
  // executions will restore the correct frame when they are rendered.
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string | symbol, unknown>;
    obj[CONTEXT_FRAME_SYMBOL] = frame;

    // If the node is a VNode with children, recursively mark its children
    const children = obj.children as unknown;
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i] as Renderable;
        if (child) {
          children[i] = markWithFrame(child, frame) as Renderable;
        }
      }
    } else if (children) {
      obj.children = markWithFrame(children as Renderable, frame) as Renderable;
    }
  }
  return node;
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
}): Renderable {
  const { fn, __frame } = props;

  // Execute the function-child within the provider frame.
  // The owner's ownerFrame is already set by the renderer when the component was created.
  // Any resources started during this execution will capture this frame as their
  // snapshot, ensuring they see the context values from this render, not future renders.
  const res = withContext(__frame, () => fn());

  // Mark the result so the renderer knows to set ownerFrame on child instances
  if (res) return markWithFrame(res, __frame);
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

/**
 * Deprecated aliases for backward compatibility
 * These should not be used in new code
 */
export function executeWithinFrame<T>(
  frame: ContextFrame | null,
  fn: () => T
): T {
  return withContext(frame, fn);
}
