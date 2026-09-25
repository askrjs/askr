/**
 * Position of the active entry in this document's session history.
 *
 * Askr stamps the index into every entry it writes so a failed back/forward
 * traversal can return the user to the entry they left with `history.go()`,
 * rather than rewriting the entry they landed on. The index is `undefined`
 * once the user reaches an entry Askr did not write, since its position is
 * then unknown.
 */
let currentHistoryIndex: number | undefined;
let pendingReturnIndex: number | undefined;
let historyIndexInitialized = false;

export function readHistoryIndex(state: unknown): number | undefined {
  if (!state || typeof state !== 'object') return undefined;
  const index = (state as { askrIndex?: unknown }).askrIndex;
  return typeof index === 'number' ? index : undefined;
}

export function getHistoryIndex(): number | undefined {
  return currentHistoryIndex;
}

export function setHistoryIndex(index: number | undefined): void {
  currentHistoryIndex = index;
}

/** The index an entry written with `mode` occupies. */
export function nextHistoryIndex(mode: 'push' | 'replace'): number | undefined {
  if (currentHistoryIndex === undefined) return undefined;
  return mode === 'push' ? currentHistoryIndex + 1 : currentHistoryIndex;
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
    currentHistoryIndex = index;
    return;
  }
  if (
    historyIndexInitialized ||
    typeof window.history?.replaceState !== 'function'
  )
    return;
  historyIndexInitialized = true;
  currentHistoryIndex = 0;
  window.history.replaceState(
    { ...(state && typeof state === 'object' ? state : {}), askrIndex: 0 },
    '',
    window.location.href
  );
}

/** @internal Forget tracked history positions, as a fresh document would. */
export function resetHistoryIndex(): void {
  currentHistoryIndex = undefined;
  pendingReturnIndex = undefined;
  historyIndexInitialized = false;
}

/**
 * Traverse back to the entry at `index`. Returns false when either position
 * is unknown, leaving history untouched.
 */
export function returnToHistoryIndex(index: number | undefined): boolean {
  if (index === undefined || currentHistoryIndex === undefined) return false;
  const delta = index - currentHistoryIndex;
  if (delta !== 0) {
    pendingReturnIndex = index;
    window.history.go(delta);
  }
  return true;
}

/**
 * Whether this popstate completes a {@link returnToHistoryIndex} traversal,
 * whose destination is already rendered.
 */
export function consumeHistoryReturn(state: unknown): boolean {
  const expected = pendingReturnIndex;
  pendingReturnIndex = undefined;
  return expected !== undefined && readHistoryIndex(state) === expected;
}
