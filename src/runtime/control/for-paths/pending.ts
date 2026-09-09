import { recordBenchFastLane } from '../../diagnostics/for-bench';
import type { ForCommitStrategy, ForState } from '../for-state';

/**
 * Publish the strategy a path chose, together with the three pending fields
 * every path owns.
 *
 * Every parameter is required, so a path cannot leave one of these behind by
 * omission — which is how they were previously written, one scattered
 * assignment at a time. The three remaining `pending*` fields belong to exactly
 * one path each (`pendingInsertedIndex`, `pendingAppendStart`,
 * `pendingRemovedKey`) and are assigned by that path directly; the others leave
 * them as reconciliation found them, since each commit clears them through
 * `clearForDomUpdateState`.
 */
export function setForCommitPending<T>(
  forState: ForState<T>,
  strategy: ForCommitStrategy,
  pendingDirtyIndices: number[] | null,
  pendingSwapIndices: [number, number] | null,
  pendingMoveOnly: boolean
): void {
  recordBenchFastLane(strategy);
  forState.lastCommitStrategy = strategy;
  forState.pendingDirtyIndices = pendingDirtyIndices;
  forState.pendingSwapIndices = pendingSwapIndices;
  forState.pendingMoveOnly = pendingMoveOnly;
}
