import {
  createSource,
  currentComponent,
  notify,
  readSource,
} from '../core/api/hooks';
import {
  activeRouteRevalidations,
  onRouteRevalidationChange,
} from './route-loader-cache';

/** What the router is doing about navigation right now; see {@link navigationState}. */
export interface NavigationState {
  /** A navigation is waiting on route resolution (auth, policies, lazy chunk, loaders). */
  readonly pending: boolean;
  /** The public href being navigated to while `pending`; otherwise `null`. */
  readonly to: string | null;
  /** Cached route data is being refreshed in the background. */
  readonly revalidating: boolean;
  /**
   * The public href of the most recent navigation a {@link blockNavigation}
   * blocker refused, until the next navigation begins; otherwise `null`.
   */
  readonly blocked: string | null;
}

const IDLE: NavigationState = Object.freeze({
  pending: false,
  to: null,
  revalidating: false,
  blocked: null,
});

let snapshot: NavigationState = IDLE;
let pendingRequest: number | null = null;
let pendingTo: string | null = null;
let blockedTo: string | null = null;
const source = createSource();

function publish(): void {
  const pending = pendingRequest !== null;
  const to = pending ? pendingTo : null;
  const revalidating = activeRouteRevalidations() > 0;
  if (
    snapshot.pending === pending &&
    snapshot.to === to &&
    snapshot.revalidating === revalidating &&
    snapshot.blocked === blockedTo
  ) {
    return;
  }
  snapshot = Object.freeze({ pending, to, revalidating, blocked: blockedTo });
  notify(source);
}

onRouteRevalidationChange(publish);

/** The navigation request `id` is waiting on resolution of `to`. */
export function beginPendingNavigation(id: number, to: string): void {
  pendingRequest = id;
  pendingTo = to;
  publish();
}

/** Resolution of request `id` finished; a newer request keeps its own state. */
export function endPendingNavigation(id: number): void {
  if (pendingRequest !== id) return;
  pendingRequest = null;
  pendingTo = null;
  publish();
}

/** A blocker refused the navigation to `to`; it stays reported until the next one. */
export function reportBlockedNavigation(to: string): void {
  blockedTo = to;
  publish();
}

/** Forget every pending navigation (teardown) and any reported refusal. */
export function clearPendingNavigation(): void {
  pendingRequest = null;
  pendingTo = null;
  blockedTo = null;
  publish();
}

/**
 * Read whether a navigation is pending and whether route data is being
 * revalidated. Reactive when called while rendering a client component; the
 * returned object is replaced, never mutated, when the state changes. On the
 * server it always reports idle.
 */
export function navigationState(): NavigationState {
  const instance = currentComponent();
  if (instance && !instance.server && typeof window !== 'undefined') {
    readSource(source);
  }
  return typeof window === 'undefined' ? IDLE : snapshot;
}
