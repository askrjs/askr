import { ELEMENT_TYPE } from '../common/jsx';
import type { ContextFrame } from './context';

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
