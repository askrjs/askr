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
 * inherits the origin recorded on `caught` so routing still starts where the
 * overflow first escaped. This runs near an exhausted stack, so carrying the
 * origin is best-effort: the cheap lookup runs first, and if recording fails
 * the converted error is still returned without an origin.
 */
export function clarifyRenderError(caught: unknown): unknown {
  let origin: Owner | undefined;
  try {
    origin =
      caught !== null && typeof caught === 'object'
        ? errorOrigins.get(caught)
        : undefined;
  } catch {
    origin = undefined;
  }
  const error = clarifyRenderOverflow(caught);
  if (error !== caught && origin) {
    try {
      errorOrigins.set(error as object, origin);
    } catch {
      // Out of stack; the converted error keeps no origin.
    }
  }
  return error;
}
