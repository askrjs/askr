/**
 * Error boundaries. A component instance becomes a boundary by setting
 * `boundary`: a handler that accepts an error (returning true) and makes the
 * instance render its fallback on its next render.
 */

import type { Owner } from '../reactive/owner';
import { ComponentInstance } from './instance';

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
  if (!deliverToBoundary(owner, error)) throw error;
}
