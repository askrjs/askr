/** Controlled selects settle once their option operations have committed. */
import { CommitMutationError, type Pass } from './pass';
import { enclosingSelect, recordSelectUndo, resyncSelect } from './props';
import type { HostNode, Parent } from './tree';

/**
 * A select's controlled value depends on its options. When a pass changes
 * them without patching the select (a child component, `For`, or function
 * child adds, removes, or edits options), re-apply the select's value after
 * the pass commits, once per select. Each change registers its own sync so
 * an error boundary that rewinds part of the pass drops only its own.
 */
const scheduledSelectSyncs = new WeakMap<Pass, Set<HostNode>>();
const writtenSelectValues = new WeakMap<Pass, Set<HostNode>>();

export function syncEnclosingSelect(pass: Pass, parent: Parent | null): void {
  const select = enclosingSelect(parent);
  if (!select || select.dormant || !('value' in select.props)) return;
  let scheduled = scheduledSelectSyncs.get(pass);
  if (!scheduled) scheduledSelectSyncs.set(pass, (scheduled = new Set()));
  if (scheduled.has(select)) return;
  scheduled.add(select);
  pass.onDiscard(() => scheduled!.delete(select));
  recordSelectUndo(pass, select);
  pass.beforeJournalSettle(() => {
    if (writtenSelectValues.get(pass)?.has(select)) return;
    try {
      resyncSelect(select);
    } catch (error) {
      throw new CommitMutationError(error);
    }
  });
}

/** The select's own patch applied its value after its options. */
export function markSelectSynced(pass: Pass, select: HostNode): void {
  let written = writtenSelectValues.get(pass);
  if (!written) writtenSelectValues.set(pass, (written = new Set()));
  written.add(select);
}
