import { globalScheduler } from './scheduler';

let _bulkCommitActive = false;
let _appliedParents: WeakSet<Element> | null = null;

export function enterBulkCommit(): void {
  _bulkCommitActive = true;
  // Initialize registry of parents that had fast-path applied during this bulk commit
  _appliedParents = new WeakSet<Element>();

  // Clear any previously scheduled synchronous scheduler tasks so they don't
  // retrigger evaluations during the committed fast-path. This is a safety
  // barrier to enforce quiescence for bulk commits.
  try {
    const cleared = globalScheduler.clearPendingSyncTasks?.() ?? 0;
    if (process.env.NODE_ENV !== 'production') {
      const _g = globalThis as Record<string, unknown>;
      _g.__ASKR_FASTLANE_CLEARED_TASKS = cleared;
    }
  } catch (err) {
    // In the unlikely event clearing fails in production, ignore it; in dev rethrow
    if (process.env.NODE_ENV !== 'production') throw err;
  }
}

export function exitBulkCommit(): void {
  _bulkCommitActive = false;
  // Clear registry to avoid leaking across commits
  _appliedParents = null;
}

export function isBulkCommitActive(): boolean {
  return _bulkCommitActive;
}

// Mark that a fast-path was applied on a parent element during the active
// bulk commit. No-op if there is no active bulk commit.
export function markFastPathApplied(parent: Element): void {
  if (!_appliedParents) return;
  try {
    _appliedParents.add(parent);
  } catch (e) {
    void e;
  }
}

export function isFastPathApplied(parent: Element): boolean {
  return !!(_appliedParents && _appliedParents.has(parent));
}
