import { isRouteActivityActive } from '../../common/route-activity';
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

/** A gating condition for lifecycle primitives like {@link timer}; `true` means active. */
export type ActivityPredicate = () => boolean;

/** Options for {@link timer}. */
export interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}

function normalizePredicates(
  predicates: TimerOptions['when']
): readonly ActivityPredicate[] {
  if (!predicates) {
    return [];
  }

  return typeof predicates === 'function' ? [predicates] : predicates;
}

function allPredicatesPass(predicates: readonly ActivityPredicate[]): boolean {
  for (const predicate of predicates) {
    if (!predicate()) {
      return false;
    }
  }

  return true;
}

type LifecycleSlotKind = 'timer' | 'listener' | 'task' | 'watch';

type LifecycleSlot = {
  kind: LifecycleSlotKind;
};

/** {@link ActivityPredicate} that is true while the current route matches `pathOrPaths`. */
export function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate {
  return () => isRouteActivityActive(pathOrPaths);
}
export {
  normalizePredicates,
  allPredicatesPass,
  LifecycleSlotKind,
  LifecycleSlot,
};
