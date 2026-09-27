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
  try {
    if (!errorOrigins.has(error)) errorOrigins.set(error, owner);
  } catch {
    // Out of stack near an overflow; a shallower frame records an origin.
  }
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
 * `caught`, or a `RenderDepthError` when it is a stack overflow. The new error
 * inherits the origin recorded on `caught`, so routing still starts where the
 * overflow first escaped. Runs near an exhausted stack: if copying the origin
 * fails, `caught` is returned unconverted and a shallower frame converts it.
 */
export function clarifyRenderError(caught: unknown): unknown {
  const error = clarifyRenderOverflow(caught);
  if (error === caught) return caught;
  try {
    const origin = errorOrigins.get(caught as object);
    if (origin) errorOrigins.set(error as object, origin);
    return error;
  } catch {
    return caught;
  }
}
