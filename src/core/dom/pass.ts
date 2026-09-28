/**
 * A render pass.
 *
 * The render phase runs components, diffs their output, and builds new DOM
 * off-document. Anything that would change live DOM or committed renderer
 * state is recorded as an operation instead. `commit()` applies the
 * operations in order; `discard()` drops them, disposes every owner the pass
 * created, and rewinds the render journal (props and scope values set during
 * render). A failed structural DOM write restores child lists that this pass
 * already applied, then discards its provisional owners and subscriptions.
 *
 * Operations are recorded parent-first: a reconcile reserves its slot before
 * its children record theirs, so a parent places its children before the
 * children update their own contents.
 */

import { reportUncaughtErrorLater } from '../../common/report-error';
import type { ComponentInstance } from '../component/instance';
import {
  createRenderJournal,
  journalMark,
  recordUndo,
  rewindJournal,
  settleJournal,
  withRenderJournal,
} from '../component/journal';
import type { RenderJournal } from '../component/journal';
import type { Owner } from '../reactive/owner';
import { queueTask } from '../reactive/scheduler';

type Op = () => void;

/** A structural DOM write failed before its render pass could publish. */
export class CommitMutationError extends Error {
  constructor(readonly failure: unknown) {
    super('DOM commit failed');
  }
}

export interface PassMark {
  readonly ops: number;
  readonly created: number;
  readonly rendered: number;
  readonly journal: number;
  readonly after: number;
  readonly beforeSettle: number;
  readonly commitUndo: number;
  readonly commitSettle: number;
  readonly dormantPortalWriter: boolean;
}

export class Pass {
  /** A server portal writer is inside a selectively hydrated host. */
  hasDormantPortalWriter = false;
  /** Prevent an aborted DOM commit from retrying itself in the same flush. */
  commitAborted = false;
  private readonly ops: Array<Op | null> = [];
  private readonly created: Owner[] = [];
  /** Instances rendered by this pass, children before parents. */
  private readonly renderedInstances: ComponentInstance[] = [];
  private readonly afterCommit: Op[] = [];
  /** Operations that must succeed before the pass publishes its journal. */
  private readonly beforeSettle: Op[] = [];
  private readonly commitUndo: Op[] = [];
  private readonly commitSettle: Op[] = [];
  private readonly journal: RenderJournal = createRenderJournal();
  private phase: 'prepared' | 'applied' | 'published' | 'discarded' =
    'prepared';
  private failures: unknown[] = [];

  /** Run render work with this pass's provisional undo journal active. */
  run<T>(render: () => T): T {
    return withRenderJournal(this.journal, render);
  }

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
    recordUndo(fn, this.journal);
  }

  /** Run after all operations are applied (refs). */
  after(fn: Op): void {
    this.afterCommit.push(fn);
  }

  /** Run after DOM operations while the pass can still be rolled back. */
  beforeJournalSettle(fn: Op): void {
    this.beforeSettle.push(fn);
  }

  /** Restore a reversible write on abort; settle its old lifetime on success. */
  onReversibleCommit(undo: Op, settle: Op = () => {}): void {
    this.commitUndo.push(undo);
    this.commitSettle.push(settle);
  }

  mark(): PassMark {
    return {
      ops: this.ops.length,
      created: this.created.length,
      rendered: this.renderedInstances.length,
      journal: journalMark(this.journal),
      after: this.afterCommit.length,
      beforeSettle: this.beforeSettle.length,
      commitUndo: this.commitUndo.length,
      commitSettle: this.commitSettle.length,
      dormantPortalWriter: this.hasDormantPortalWriter,
    };
  }

  /** Discard everything recorded since `mark` (an error boundary caught). */
  rewind(mark: PassMark): unknown[] {
    const errors: unknown[] = [];
    this.ops.length = mark.ops;
    this.afterCommit.length = mark.after;
    this.renderedInstances.length = mark.rendered;
    this.hasDormantPortalWriter = mark.dormantPortalWriter;
    this.beforeSettle.length = mark.beforeSettle;
    this.commitUndo.length = mark.commitUndo;
    this.commitSettle.length = mark.commitSettle;
    rewindJournal(this.journal, mark.journal, errors);
    for (const owner of this.created.splice(mark.created).reverse()) {
      owner.dispose(errors);
    }
    return errors;
  }

  discard(): unknown[] {
    if (this.phase === 'applied') return this.rollback();
    if (this.phase === 'published' || this.phase === 'discarded') return [];
    this.phase = 'discarded';
    return this.rewind({
      ops: 0,
      created: 0,
      rendered: 0,
      journal: 0,
      after: 0,
      beforeSettle: 0,
      commitUndo: 0,
      commitSettle: 0,
      dormantPortalWriter: false,
    });
  }

  /** Apply reversible operations while retaining undo work for rollback. */
  apply(): void {
    if (this.phase === 'applied') return;
    if (this.phase !== 'prepared') {
      throw new Error('[Askr] Cannot apply a settled render pass.');
    }
    const abort = (failure: unknown): never => {
      this.commitAborted = true;
      for (const error of this.rollback()) reportUncaughtErrorLater(error);
      throw failure;
    };
    this.phase = 'applied';
    for (const op of this.ops) {
      if (!op) continue;
      try {
        op();
      } catch (error) {
        if (error instanceof CommitMutationError) {
          abort(error.failure);
        }
        this.failures.push(error);
      }
    }
    for (const fn of this.beforeSettle) {
      try {
        fn();
      } catch (error) {
        if (error instanceof CommitMutationError) abort(error.failure);
        this.failures.push(error);
      }
    }
  }

  /** Publish applied work and run irreversible cleanup, refs, and lifecycles. */
  publish(): void {
    if (this.phase === 'prepared') this.apply();
    if (this.phase !== 'applied') {
      throw new Error(
        '[Askr] Cannot publish a render pass that was not applied.'
      );
    }
    this.phase = 'published';
    settleJournal(this.journal, 0);
    for (const settle of this.commitSettle) {
      try {
        settle();
      } catch (error) {
        this.failures.push(error);
      }
    }
    for (const fn of this.afterCommit) {
      try {
        fn();
      } catch (error) {
        this.failures.push(error);
      }
    }
    for (const instance of this.renderedInstances) {
      if (!instance.disposed) {
        try {
          mount(instance);
        } catch (error) {
          this.failures.push(error);
        }
      }
    }
    if (this.failures.length === 1) throw this.failures[0];
    if (this.failures.length > 1) {
      throw new AggregateError(this.failures, 'Commit failed');
    }
  }

  /** Undo applied operations and discard every provisional render mutation. */
  rollback(): unknown[] {
    if (this.phase === 'published' || this.phase === 'discarded') return [];
    const errors: unknown[] = [];
    if (this.phase === 'applied') {
      for (let index = this.commitUndo.length - 1; index >= 0; index--) {
        try {
          this.commitUndo[index]!();
        } catch (error) {
          errors.push(error);
        }
      }
    }
    this.phase = 'prepared';
    errors.push(...this.discard());
    return errors;
  }

  /** Apply and publish immediately for a standalone root render. */
  commit(): void {
    this.apply();
    this.publish();
  }
}

/** Mark an instance committed and schedule its post-commit work. */
function mount(instance: ComponentInstance): void {
  instance.mounted = true;
  const syncQueue = instance.commitSyncQueue;
  instance.commitSyncQueue = null;
  for (const fn of syncQueue ?? []) fn();
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
