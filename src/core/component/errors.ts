/**
 * Error boundaries. A component instance becomes a boundary by setting
 * `boundary`: a handler that accepts an error (returning true) and makes the
 * instance render its fallback on its next render.
 */

import { clarifyRenderOverflow } from '../../common/render-depth';
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
  const origin =
    error !== null && (typeof error === 'object' || typeof error === 'function')
      ? errorOrigins.get(error)
      : undefined;
  if (origin && deliverToBoundary(origin, error)) return;
  if (!deliverToBoundary(owner, error)) throw error;
}

/**
 * A render error with a stack overflow converted to `RenderDepthError`. The
 * converted error keeps the logical origin recorded on the one thrown.
 */
export function clarifyRenderError(error: unknown): unknown {
  const clarified = clarifyRenderOverflow(error);
  if (clarified !== error && error !== null && typeof error === 'object') {
    const origin = errorOrigins.get(error);
    if (origin) errorOrigins.set(clarified as object, origin);
  }
  return clarified;
}
