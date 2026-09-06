import type { VNode } from '../../common/vnode';
import type { ForState } from './for-state';
import type { ForItemInstance } from './for-scopes';

interface ForCommitMembership {
  readonly items: readonly ForItemInstance<unknown>[];
  readonly vnodes: readonly VNode[];
  readonly removedNodes: readonly Node[];
  readonly moveOnly: boolean;
}

export type ForCommitPlan = ForCommitMembership &
  (
    | {
        readonly kind: 'NO_REORDER';
        readonly dirtyIndices: readonly number[];
        readonly allowStablePatch: boolean;
      }
    | {
        readonly kind: 'APPEND';
        readonly appendStart: number | null;
        readonly canHydrate: boolean;
      }
    | { readonly kind: 'INSERT_ONE'; readonly index: number }
    | { readonly kind: 'SWAP'; readonly indices: readonly [number, number] }
    | { readonly kind: 'FULL_KEYED' }
  );

/** Snapshot the operation, while retaining the identity of live item scopes. */
export function prepareForCommitPlan(
  state: ForState<unknown>,
  vnodes: readonly VNode[],
  dirtyIndices: readonly number[],
  kind: ForCommitPlan['kind']
): ForCommitPlan {
  const membership: ForCommitMembership = {
    items: state.orderedItems.slice(),
    vnodes: vnodes.slice(),
    removedNodes: state.lastRemovedNodes.slice(),
    moveOnly: state.pendingMoveOnly,
  };
  switch (kind) {
    case 'NO_REORDER':
      return {
        ...membership,
        kind,
        dirtyIndices: dirtyIndices.slice(),
        allowStablePatch:
          state.lastCommitStrategy !== 'TRUNCATE' ||
          dirtyIndices.length < membership.items.length,
      };
    case 'APPEND':
      return {
        ...membership,
        kind,
        appendStart: state.pendingAppendStart,
        canHydrate: !state._hasResolvedItemDom,
      };
    case 'INSERT_ONE':
      return state.pendingInsertedIndex === null
        ? { ...membership, kind: 'FULL_KEYED' }
        : { ...membership, kind, index: state.pendingInsertedIndex };
    case 'SWAP':
      return state.pendingSwapIndices === null
        ? { ...membership, kind: 'FULL_KEYED' }
        : { ...membership, kind, indices: [...state.pendingSwapIndices] };
    case 'FULL_KEYED':
      return { ...membership, kind };
  }
}
