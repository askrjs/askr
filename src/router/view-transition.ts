/**
 * View transitions: when enabled and the browser provides
 * `document.startViewTransition`, a navigation commit runs inside the
 * transition's update callback so the browser can animate old to new.
 */
import { logger } from '../common/logger';
import { isStaleRouteRequest } from './navigation-request';

/** The `viewTransitions` option of `createSPA()` and `hydrateSPA()`. */
export type ViewTransitionsOption =
  | boolean
  | ((from: string, to: string) => boolean);

type ViewTransitionLike = {
  ready?: Promise<unknown>;
  finished?: Promise<unknown>;
  updateCallbackDone?: Promise<unknown>;
};

let viewTransitionsOption: ViewTransitionsOption = false;

export function configureViewTransitions(option?: ViewTransitionsOption): void {
  viewTransitionsOption = option ?? false;
}

/** @internal Part of the router-wide reset. */
export function resetViewTransitions(): void {
  viewTransitionsOption = false;
}

/**
 * Whether a navigation from `from` to `to` animates: an explicit request wins,
 * otherwise the app option decides. A throwing option function means no.
 */
export function shouldUseViewTransition(
  requested: boolean | undefined,
  from: string,
  to: string
): boolean {
  if (requested !== undefined) return requested;
  if (typeof viewTransitionsOption === 'function') {
    try {
      return viewTransitionsOption(from, to) === true;
    } catch (error) {
      logger.error('[Askr] viewTransitions option failed:', error);
      return false;
    }
  }
  return viewTransitionsOption === true;
}

/**
 * Run a navigation commit, inside a view transition when `animate` is set and
 * the browser supports it, otherwise directly. Inside a transition the browser
 * decides when the callback runs, so a newer navigation can have superseded
 * `requestId` by then; the commit is skipped in that case.
 */
export function runNavigationCommit(
  animate: boolean,
  requestId: number,
  commit: () => void
): void {
  const start =
    animate && typeof document !== 'undefined'
      ? (document as unknown as { startViewTransition?: unknown })
          .startViewTransition
      : undefined;
  if (typeof start !== 'function') {
    commit();
    return;
  }
  const transition = start.call(document, () => {
    if (isStaleRouteRequest(requestId)) return;
    try {
      commit();
    } catch (error) {
      // The browser owns this callback: a failure here cannot reach the
      // caller the way a direct commit's does, so it is reported here.
      logger.error('[Askr] navigation failed:', error);
    }
  }) as ViewTransitionLike | undefined;
  // A rejected promise only reports the transition itself as skipped.
  for (const promise of [
    transition?.ready,
    transition?.finished,
    transition?.updateCallbackDone,
  ]) {
    promise?.catch(() => undefined);
  }
}
