/**
 * A render pass.
 *
 * The render phase runs components, diffs their output, and builds new DOM
 * off-document. Anything that would change live DOM or committed renderer
 * state is recorded as an operation instead. `commit()` applies the
 * operations in order; `discard()` drops them and disposes every owner the
 * pass created. Nothing is undone because nothing was applied.
 *
 * Operations are recorded parent-first: a reconcile reserves its slot before
 * its children record theirs, so a parent places its children before the
 * children update their own contents.
 */

import type { Owner } from '../reactive/owner';
import type { ComponentInstance } from '../component/instance';
import { queueTask } from '../reactive/scheduler';
import { reportUncaughtErrorLater } from '../../common/report-error';

type Op = () => void;

export interface PassMark {
  ops: number;
  created: number;
  rendered: number;
  undo: number;
  afterCommit: number;
}

export class Pass {
  private ops: Array<Op | null> = [];
  private created: Owner[] = [];
  /** Instances rendered by this pass, children before parents. */
  private rendered: ComponentInstance[] = [];
  private undo: Op[] = [];
  private afterCommit: Op[] = [];
  /** The owner whose render caused this pass; used for error routing. */
  readonly hydrating: boolean;

  constructor(hydrating = false) {
    this.hydrating = hydrating;
  }

  op(fn: Op): void {
    this.ops.push(fn);
  }

  reserve(): number {
    this.ops.push(null);
    return this.ops.length - 1;
  }

  fill(slot: number, fn: Op): void {
    this.ops[slot] = fn;
  }

  /** An owner created by this pass; disposed if the pass is discarded. */
  created_(owner: Owner): void {
    this.created.push(owner);
  }

  rendered_(instance: ComponentInstance): void {
    this.rendered.push(instance);
  }

  /** Restore a provisional change made during render if the pass is discarded. */
  onDiscard(fn: Op): void {
    this.undo.push(fn);
  }

  /** Run after all operations are applied (refs, focus restoration). */
  after(fn: Op): void {
    this.afterCommit.push(fn);
  }

  mark(): PassMark {
    return {
      ops: this.ops.length,
      created: this.created.length,
      rendered: this.rendered.length,
      undo: this.undo.length,
      afterCommit: this.afterCommit.length,
    };
  }

  /** Discard everything recorded since `mark` (an error boundary caught). */
  rewind(mark: PassMark): unknown[] {
    const errors: unknown[] = [];
    this.ops.length = mark.ops;
    this.afterCommit.length = mark.afterCommit;
    this.rendered.length = mark.rendered;
    for (const undo of this.undo.splice(mark.undo).reverse()) {
      try {
        undo();
      } catch (error) {
        errors.push(error);
      }
    }
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
      undo: 0,
      afterCommit: 0,
    });
  }

  commit(): void {
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
    for (const instance of this.rendered) {
      if (instance.disposed) continue;
      instance.mounted = true;
      const queue = instance.commitQueue;
      if (!queue) continue;
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
    this.ops.length = 0;
    this.created.length = 0;
    this.rendered.length = 0;
    this.undo.length = 0;
    this.afterCommit.length = 0;
    if (failures.length === 1) throw failures[0];
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Commit failed');
    }
  }
}
