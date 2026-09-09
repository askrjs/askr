import { resetClientAuth } from './auth';
import { resetRouteActivity } from './activity';
import { resetLazyRoutes } from './lazy';
import { resetNavigationRegistry } from './navigation-registry';
import { resetNavigationScroll } from './navigation-scroll';
import { cancelRouteRequests } from './navigation-targets';
import { clearRouteState } from './store';

/**
 * Return every part of the router to its initial state.
 *
 * Router state does not live in one place: the route table is in `store.ts`,
 * but identity, current location, registered apps, in-flight requests, scroll
 * offsets and pending lazy loads each belong to their own module.
 * `clearRouteState()` only ever cleared the route table, so a caller that
 * believed it was resetting the router was leaving seven other modules holding
 * state — including a live `AbortController` and the resolved auth context.
 *
 * `clearRouteState()` keeps its narrow meaning because `createRouteRegistry`
 * uses it as a scratch clear between snapshot and restore; this is the reset a
 * test or a teardown wants.
 */
export function resetRouterState(): void {
  cancelRouteRequests();
  clearRouteState();
  resetNavigationRegistry();
  resetRouteActivity();
  resetNavigationScroll();
  resetLazyRoutes();
  resetClientAuth();
}
