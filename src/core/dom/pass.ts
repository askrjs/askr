/**
 * A render pass.
 *
 * The render phase runs components, diffs their output, and builds new DOM
 * off-document. Anything that would change live DOM or committed renderer
 * state is recorded as an operation instead. `commit()` applies the
 * operations in order; `discard()` drops them, disposes every owner the pass
 * created, and rewinds the render journal (props and scope values set during
 * render). Nothing else is undone because nothing else was applied.
 *
 * Operations are recorded parent-first: a reconcile reserves its slot before
 * its children record theirs, so a parent places its children before the
 * children update their own contents.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';
import type { ComponentInstance } from '../component/instance';
import {
  journalMark,
  recordUndo,
  rewindJournal,
  settleJournal,
} from '../component/journal';
import type { Owner } from '../reactive/owner';
import { queueTask } from '../reactive/scheduler';

type Op = () => void;

export interface PassMark {
  readonly ops: number;
  readonly created: number;
  readonly rendered: number;
  readonly journal: number;
  readonly after: number;
}

export class Pass {
  private readonly ops: Array<Op | null> = [];
  private readonly created: Owner[] = [];
  /** Instances rendered by this pass, children before parents. */
  private readonly renderedInstances: ComponentInstance[] = [];
  private readonly afterCommit: Op[] = [];
  private readonly journalStart = journalMark();

  /** Record an operation on committed state. */
  op(fn: Op): void {
    this.ops.push(fn);
  }

  /** Reserve an operation slot to fill after nested work records its own. */
  reserve(): number {
    this.ops.push(null);
    return this.ops.length - 1;
  }

  fill(slot: number, fn: Op): void {
    this.ops[slot] = fn;
  }

  /** An owner this pass created; disposed if the pass is discarded. */
  own(owner: Owner): void {
    this.created.push(owner);
  }

  /** An instance rendered by this pass; it commits (and mounts) with it. */
  markRendered(instance: ComponentInstance): void {
    this.renderedInstances.push(instance);
  }

  /** Undo a provisional render-time change if this work is discarded. */
  onDiscard(fn: Op): void {
    recordUndo(fn);
  }

  /** Run after all operations are applied (refs). */
  after(fn: Op): void {
    this.afterCommit.push(fn);
  }

  mark(): PassMark {
    return {
      ops: this.ops.length,
      created: this.created.length,
      rendered: this.renderedInstances.length,
      journal: journalMark(),
      after: this.afterCommit.length,
    };
  }

  /** Discard everything recorded since `mark` (an error boundary caught). */
  rewind(mark: PassMark): unknown[] {
    const errors: unknown[] = [];
    this.ops.length = mark.ops;
    this.afterCommit.length = mark.after;
    this.renderedInstances.length = mark.rendered;
    rewindJournal(mark.journal, errors);
    for (const owner of this.created.splice(mark.created).reverse()) {
      owner.dispose(errors);
    }
    return errors;
  }

  discard(): unknown[] {
    return this.rewind({
      ops: 0,
      created: 0,
      rendered: 0,
      journal: this.journalStart,
      after: 0,
    });
  }

  commit(): void {
    settleJournal(this.journalStart);
    const failures: unknown[] = [];
    for (const op of this.ops) {
      if (!op) continue;
      try {
        op();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const fn of this.afterCommit) {
      try {
        fn();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const instance of this.renderedInstances) {
      if (!instance.disposed) mount(instance);
    }
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Commit failed');
    }
  }
}

/** Mark an instance committed and schedule its post-commit work. */
function mount(instance: ComponentInstance): void {
  instance.mounted = true;
  const queue = instance.commitQueue;
  if (!queue) return;
  instance.commitQueue = null;
  queueTask(() => {
    if (instance.disposed) return;
    for (const fn of queue) {
      try {
        const cleanup = fn();
        if (typeof cleanup === 'function') instance.onCleanup(cleanup);
      } catch (error) {
        reportUncaughtErrorLater(error);
      }
    }
  });
}
