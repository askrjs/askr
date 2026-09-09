import {
  markVNodeTreeWithContextFrame,
  renderComponentInline,
  withContext,
  type ComponentInstance,
  type ContextFrame,
} from '../../runtime';
import { assertSyncComponentResult } from '../../common/promise';

/**
 * Enforce the synchronous-component contract and bind a result to its frame.
 *
 * Every host module produced a component result and then repeated the same two
 * steps by hand. They are one step conceptually — a component result is not
 * usable until it has been checked and bound — so they are one call.
 */
export function scopeComponentResult(
  result: unknown,
  frame: ContextFrame | null
): unknown {
  assertSyncComponentResult(result);
  return markVNodeTreeWithContextFrame(result, frame);
}

/**
 * Render `instance` under `frame`, then check and bind its result.
 *
 * Passing `null` clears the ambient context frame for the render, which is what
 * every caller of this helper wants. A caller that must keep the ambient frame
 * when it has no frame of its own renders itself and calls
 * {@link scopeComponentResult} on the result instead.
 */
export function renderComponentInScope(
  instance: ComponentInstance,
  frame: ContextFrame | null
): unknown {
  return scopeComponentResult(
    withContext(frame, () => renderComponentInline(instance)),
    frame
  );
}
