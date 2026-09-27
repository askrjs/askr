/**
 * The render journal records how to undo component state changed while
 * rendering (new props, provided scope values). A render pass marks it before
 * rendering, rewinds it when that work is discarded, and clears it when the
 * work commits. It never holds entries outside a render.
 */

type Undo = () => void;

const entries: Undo[] = [];

export function recordUndo(undo: Undo): void {
  entries.push(undo);
}

export function journalMark(): number {
  return entries.length;
}

/** Undo everything recorded after `mark`, most recent first. */
export function rewindJournal(mark: number, errors: unknown[]): void {
  while (entries.length > mark) {
    try {
      entries.pop()!();
    } catch (error) {
      errors.push(error);
    }
  }
}

/** Keep the changes recorded after `mark` (their render committed). */
export function settleJournal(mark: number): void {
  entries.length = Math.min(entries.length, mark);
}
