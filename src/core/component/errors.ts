/**
 * Error boundaries. A component instance becomes a boundary by setting
 * `boundary`: a handler that accepts an error (returning true) and makes the
 * instance render its fallback on its next render.
 */

import { RenderDepthError } from '../../common/render-depth';
import type { Owner } from '../reactive/owner';
import { ComponentInstance } from './instance';

const errorOrigins = new WeakMap<object, Owner>();

/** Remember the logical owner where an error first escaped rendering. */
export function noteErrorOrigin(owner: Owner | null, error: unknown): void {
  if (
    !owner ||
    (typeof error !== 'object' && typeof error !== 'function') ||
    error === null
  )
    return;
  if (!errorOrigins.has(error)) errorOrigins.set(error, owner);
}

/**
 * Deliver `error` to the nearest boundary at or above `owner` and schedule it
 * to re-render. Returns false when no boundary accepted it.
 */
export function deliverToBoundary(
  owner: Owner | null,
  error: unknown
): boolean {
  for (let o = owner; o; o = o.parent) {
    if (o instanceof ComponentInstance && o.boundary && !o.disposed) {
      if (o.boundary(error)) {
        o.computation.invalidate();
        return true;
      }
    }
  }
  return false;
}

/** Deliver `error` to a boundary, or throw it to the caller. */
export function routeError(owner: Owner | null, error: unknown): void {
  const origin = originOf(error);
  if (origin && deliverToBoundary(origin, error)) return;
  if (!deliverToBoundary(owner, error)) throw error;
}

/**
 * The origin recorded for `error`. For a `RenderDepthError`, the origin
 * recorded on the engine error it wraps wins: that was noted where the
 * overflow first escaped, before a shallower frame converted it.
 */
function originOf(error: unknown): Owner | undefined {
  if (
    error === null ||
    (typeof error !== 'object' && typeof error !== 'function')
  ) {
    return undefined;
  }
  if (error instanceof RenderDepthError) {
    const cause = error.cause;
    const deeper =
      cause !== null && typeof cause === 'object'
        ? errorOrigins.get(cause)
        : undefined;
    if (deeper) return deeper;
  }
  return errorOrigins.get(error);
}
