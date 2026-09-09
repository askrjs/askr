import type { ForCommitPlan } from './for-commit-plan';
import type { ForCommitStrategy, ForState } from './for-state';

/**
 * What publishing a commit must do to the parent's keyed element map.
 *
 * `canSyncKeyedMapMutate` and `syncKeyedMapFromForState` used to answer this
 * separately, once each, and a disagreement between them silently corrupted the
 * map. Both now resolve the effect through `resolveForKeyMapEffect` so there is
 * one answer per strategy.
 */
export type ForKeyMapEffect =
  /** The map already describes the committed DOM. */
  | 'none'
  /** Drop entries whose element is no longer a child of the parent. */
  | 'prune'
  /** Drop exactly `forState.pendingRemovedKey`. */
  | 'delete-one'
  /** Empty the map and forget the parent. */
  | 'clear'
  /** Add the newly appended tail keys, keeping the existing entries. */
  | 'append'
  /** Discard and rebuild from the current ordered keys. */
  | 'rebuild';

/** Per-strategy facts that do not depend on the state of a given commit. */
interface ForStrategyTraits {
  /**
   * The commit plan this strategy is applied through. Seven strategies map onto
   * five plan kinds: `REMOVE_ONE` and `TRUNCATE` both commit as `NO_REORDER`,
   * having already been applied to the model by reconciliation.
   */
  readonly planKind: ForCommitPlan['kind'];
  /** Whether the commit needs the dirty index list computed. */
  readonly needsDirtyIndices: boolean;
  /** How broadly multi-node item ranges must be pre-resolved before committing. */
  readonly rangeBreadth: 'all' | 'pending';
}

export const FOR_STRATEGY_TRAITS: Readonly<
  Record<ForCommitStrategy, ForStrategyTraits>
> = {
  APPEND: {
    planKind: 'APPEND',
    needsDirtyIndices: false,
    rangeBreadth: 'pending',
  },
  INSERT_ONE: {
    planKind: 'INSERT_ONE',
    needsDirtyIndices: false,
    rangeBreadth: 'pending',
  },
  REMOVE_ONE: {
    planKind: 'NO_REORDER',
    needsDirtyIndices: true,
    rangeBreadth: 'pending',
  },
  TRUNCATE: {
    planKind: 'NO_REORDER',
    needsDirtyIndices: true,
    rangeBreadth: 'pending',
  },
  NO_REORDER: {
    planKind: 'NO_REORDER',
    needsDirtyIndices: true,
    rangeBreadth: 'pending',
  },
  SWAP: {
    planKind: 'SWAP',
    needsDirtyIndices: false,
    rangeBreadth: 'pending',
  },
  FULL_KEYED: {
    planKind: 'FULL_KEYED',
    needsDirtyIndices: false,
    rangeBreadth: 'all',
  },
};

/**
 * The keyed-map effect for one commit.
 *
 * Unlike the traits above this depends on the commit: whether a map already
 * exists, whether anything was removed, and how much of the list survived.
 */
export function resolveForKeyMapEffect(
  existing: Map<string | number, Element> | undefined,
  forState: ForState<unknown>,
  strategy: ForCommitStrategy,
  removedNodes: readonly Node[]
): ForKeyMapEffect {
  switch (strategy) {
    case 'SWAP':
      // A transposition moves elements without changing any key/element pair.
      return existing ? 'none' : 'rebuild';
    case 'FULL_KEYED':
      return existing && removedNodes.length === 0 ? 'none' : 'rebuild';
    case 'NO_REORDER':
      if (!existing) return 'rebuild';
      return removedNodes.length === 0 ? 'none' : 'prune';
    case 'REMOVE_ONE':
      return existing && forState.pendingRemovedKey !== null
        ? 'delete-one'
        : 'none';
    case 'TRUNCATE':
      if (forState.orderedKeys.length > 0) return 'rebuild';
      return existing ? 'clear' : 'none';
    case 'APPEND':
      return existing ? 'append' : 'rebuild';
    case 'INSERT_ONE':
      return 'rebuild';
  }
}
