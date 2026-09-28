/**
 * A render journal records how to undo render-time changes for one pass.
 * Nested error boundaries can rewind to a local mark; independent prepared
 * roots never share entries or clear one another's undo work.
 */

type Undo = () => void;

export interface RenderJournal {
  readonly entries: Undo[];
}

let activeJournal: RenderJournal | null = null;

export function createRenderJournal(): RenderJournal {
  return { entries: [] };
}

/** Run synchronous render work with `journal` as its undo destination. */
export function withRenderJournal<T>(
  journal: RenderJournal,
  render: () => T
): T {
  const previous = activeJournal;
  activeJournal = journal;
  try {
    return render();
  } finally {
    activeJournal = previous;
  }
}

export function recordUndo(undo: Undo, journal = activeJournal): void {
  journal?.entries.push(undo);
}

export function journalMark(journal: RenderJournal): number {
  return journal.entries.length;
}

/** Undo everything recorded after `mark`, most recent first. */
export function rewindJournal(
  journal: RenderJournal,
  mark: number,
  errors: unknown[]
): void {
  while (journal.entries.length > mark) {
    try {
      journal.entries.pop()!();
    } catch (error) {
      errors.push(error);
    }
  }
}

/** Keep the changes recorded after `mark` (their render committed). */
export function settleJournal(journal: RenderJournal, mark: number): void {
  journal.entries.length = Math.min(journal.entries.length, mark);
}
