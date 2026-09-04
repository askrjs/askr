import type { ReadableSource } from './readable';

export interface OwnedChildScope {
  key: string | number;
  dispose(): void;
}

/** One record per lifetime. Render and request revisions belong to execution
 * and requests respectively; neither replaces this identity on a rerender. */
export class OwnershipRecord {
  identity: object = this;
  disposed = false;
  mounted = false;
  controller: AbortController | null = null;
  signal: AbortSignal | undefined;
  cleanups: Array<() => void> | undefined;
  children: Set<OwnedChildScope> | undefined;
  reads: Set<ReadableSource<unknown>> | undefined;
  finalizer: { release(): void } | undefined;
}

/** A shared view surface populated only by the public compatibility adapter. */
export const componentRecordPrototype: object = {};

// Capture the platform reason outside user execution. Retained signals must
// not retain a departed component through a teardown stack on their reason.
const disposedSignal: AbortSignal = (() => {
  const controller = new AbortController();
  controller.abort();
  return controller.signal;
})();

export function getOwnershipSignal(owner: OwnershipRecord): AbortSignal {
  if (owner.signal) return owner.signal;
  if (owner.disposed) return disposedSignal;
  owner.controller ??= new AbortController();
  return (owner.signal = owner.controller.signal);
}

export function ownCleanup(owner: OwnershipRecord, cleanup: () => void): void {
  if (owner.disposed) cleanup();
  else (owner.cleanups ??= []).push(cleanup);
}

export function ownChild(owner: OwnershipRecord, child: OwnedChildScope): void {
  if (owner.disposed) child.dispose();
  else (owner.children ??= new Set()).add(child);
}

/** Drain attachments within a composite cleanup before surfacing its failures. */
export function drainOwnedCleanup<T>(
  items: Iterable<T>,
  cleanup: (item: T) => void
): void {
  const errors: unknown[] = [];
  for (const item of items) {
    try {
      cleanup(item);
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length) throw new AggregateError(errors, 'Owned cleanup failed');
}

interface DisposalPhases {
  beforeCleanup?(): void;
  afterCleanup?(): void;
  recordError(message: string, error: unknown): void;
}

/** All owner kinds drain the same lifetime, even after a child or cleanup fails. */
export function disposeOwnership(
  owner: OwnershipRecord,
  phases: DisposalPhases
): void {
  if (owner.disposed) return;
  owner.disposed = true;
  const attempt = (message: string, run: () => void): void => {
    try {
      run();
    } catch (error) {
      phases.recordError(message, error);
    }
  };
  const children = owner.children;
  owner.children = undefined;
  if (children) {
    for (const child of children) {
      attempt('[Askr] child scope cleanup threw:', () => child.dispose());
    }
    children.clear();
  }
  if (phases.beforeCleanup) {
    attempt(
      '[Askr] readable subscription cleanup threw:',
      phases.beforeCleanup
    );
  }
  const cleanups = owner.cleanups;
  owner.cleanups = undefined;
  if (cleanups) {
    for (const cleanup of cleanups) {
      attempt('[Askr] cleanup function threw:', cleanup);
    }
  }
  if (phases.afterCleanup) {
    attempt('[Askr] readable subscription cleanup threw:', phases.afterCleanup);
  }
  attempt('[Askr] abort controller cleanup threw:', () => {
    if (owner.controller && !owner.controller.signal.aborted) {
      owner.controller.abort(disposedSignal.reason);
    }
  });
  owner.controller = null;
  owner.reads = undefined;
  owner.mounted = false;
  const finalizer = owner.finalizer;
  owner.finalizer = undefined;
  if (finalizer)
    attempt('[Askr] owner finalization threw:', () => finalizer.release());
}
