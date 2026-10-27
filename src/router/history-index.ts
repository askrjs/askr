/**
 * Positions in this document's session history.
 *
 * Askr stamps an index into every entry it writes. A failed back/forward
 * traversal then returns with `history.go()` to the entry whose page is still
 * rendered, instead of rewriting the entry the browser landed on. A position
 * is `undefined` once it cannot be known, for example after other code pushed
 * an entry; rollback then reloads rather than guess.
 */
let landedIndex: number | undefined;
let renderedIndex: number | undefined;
let pendingReturnIndex: number | undefined;
let historyIndexInitialized = false;
let browserHistoryPosition: number | undefined;

function currentBrowserHistoryPosition(): number | undefined {
  const navigation = (
    window as Window & {
      navigation?: { currentEntry?: { index?: number } | null };
    }
  ).navigation;
  const index = navigation?.currentEntry?.index;
  return typeof index === 'number' && index >= 0 ? index : undefined;
}

export function readHistoryIndex(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const index = (state as { askrIndex?: unknown }).askrIndex;
  return typeof index === 'number' ? index : undefined;
}

function stampActiveEntry(state: unknown, index: number): void {
  window.history.replaceState(
    { ...(state && typeof state === 'object' ? state : {}), askrIndex: index },
    '',
    window.location.href
  );
}

/**
 * The index an entry written with `mode` occupies. The active entry must still
 * carry the index Askr last tracked; otherwise other code wrote an entry and
 * positions are unknown from here on.
 */
export function nextHistoryIndex(mode: 'push' | 'replace'): number | undefined {
  if (readHistoryIndex(window.history.state) !== landedIndex) {
    landedIndex = renderedIndex = undefined;
  }
  if (landedIndex === undefined) return undefined;
  return mode === 'push' ? landedIndex + 1 : landedIndex;
}

/** Record that the entry at `index` is active and its page rendered. */
export function commitHistoryIndex(index: number | undefined): void {
  landedIndex = renderedIndex = index;
  browserHistoryPosition = currentBrowserHistoryPosition();
}

/**
 * Record the entry a popstate landed on, before its page renders. An entry
 * without an index may have been written outside the router, so its position
 * cannot be inferred safely unless the Navigation API confirms a one-entry
 * forward move to a fragment entry.
 */
export function landOnHistoryEntry(
  state: unknown,
  fragmentTraversal = false
): number | undefined {
  let index = readHistoryIndex(state);
  const position = currentBrowserHistoryPosition();
  if (
    index === undefined &&
    fragmentTraversal &&
    landedIndex !== undefined &&
    position !== undefined &&
    browserHistoryPosition !== undefined &&
    position === browserHistoryPosition + 1
  ) {
    index = landedIndex + 1;
    stampActiveEntry(state, index);
  }
  landedIndex = index;
  browserHistoryPosition = position;
  return index;
}

/**
 * Adopt the active entry's index. Only the document's first entry is stamped
 * as index 0: stamping later would guess a position the user may not be at.
 */
export function initializeHistoryIndex(): void {
  const state: unknown = window.history?.state;
  const index = readHistoryIndex(state);
  if (index !== undefined) {
    historyIndexInitialized = true;
    commitHistoryIndex(index);
    return;
  }
  if (
    historyIndexInitialized ||
    typeof window.history?.replaceState !== 'function'
  )
    return;
  historyIndexInitialized = true;
  commitHistoryIndex(0);
  stampActiveEntry(state, 0);
}

/** @internal Forget tracked history positions, as a fresh document would. */
export function resetHistoryIndex(): void {
  landedIndex = renderedIndex = pendingReturnIndex = undefined;
  browserHistoryPosition = undefined;
  historyIndexInitialized = false;
}

/**
 * Traverse back to the entry whose page is rendered. Returns false when the
 * positions are unknown, leaving history untouched.
 */
export function returnToRenderedHistoryEntry(): boolean {
  if (landedIndex === undefined || renderedIndex === undefined) return false;
  const delta = renderedIndex - landedIndex;
  // A traversal always lands on another entry; a zero delta means tracking
  // went wrong, so the position is effectively unknown.
  if (delta === 0) return false;
  pendingReturnIndex = renderedIndex;
  window.history.go(delta);
  return true;
}

/** A newer navigation owns history, so a pending return must not skip it. */
export function cancelHistoryReturn(): void {
  pendingReturnIndex = undefined;
}

/**
 * Whether this popstate completes a {@link returnToRenderedHistoryEntry}
 * traversal, whose destination is already rendered.
 */
export function consumeHistoryReturn(state: unknown): boolean {
  const expected = pendingReturnIndex;
  pendingReturnIndex = undefined;
  if (expected === undefined || readHistoryIndex(state) !== expected) {
    return false;
  }
  commitHistoryIndex(expected);
  return true;
}
