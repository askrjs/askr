import type { ReadableSource } from './readable';

export interface OwnedChildScope {
  key: string | number;
  dispose(): void;
}

/** One record per lifetime. Render and request revisions belong to execution
 * and requests respectively; neither replaces this identity on a rerender. */
export class OwnershipRecord {
  identity: object = this;
  parent: OwnershipRecord | undefined;
  firstOwnedChild: OwnershipRecord | undefined;
  lastOwnedChild: OwnershipRecord | undefined;
  previousOwnedSibling: OwnershipRecord | undefined;
  nextOwnedSibling: OwnershipRecord | undefined;
  subject: object | undefined;
  lifecycle: ((owner: OwnershipRecord) => DisposalPhases) | undefined;
  disposed = false;
  mounted = false;
  controller: AbortController | null = null;
  signal: AbortSignal | undefined;
  cleanups: Array<() => void> | undefined;
  scope: OwnedChildScope | undefined;
  scopedIndex: Set<OwnedChildScope> | undefined;
  hadScopedChildren = false;
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

const scopedOwners = new WeakMap<OwnedChildScope, OwnershipRecord>();

/** Index an existing native lifetime; scopes never receive another owner. */
export function registerScopedOwnership(
  scope: OwnedChildScope,
  owner: OwnershipRecord
): void {
  owner.scope = scope;
  scopedOwners.set(scope, owner);
  if (owner.parent) {
    owner.parent.hadScopedChildren = true;
    owner.parent.scopedIndex?.add(scope);
  }
}

function scopedOwnership(child: OwnedChildScope): OwnershipRecord {
  let lifetime = scopedOwners.get(child);
  if (!lifetime) {
    lifetime = new OwnershipRecord();
    lifetime.cleanups = [() => child.dispose()];
    registerScopedOwnership(child, lifetime);
  }
  return lifetime;
}

export function ownChild(owner: OwnershipRecord, child: OwnedChildScope): void {
  attachOwnership(scopedOwnership(child), owner);
}

export function releaseOwnedChild(
  owner: OwnershipRecord,
  child: OwnedChildScope
): void {
  const lifetime = scopedOwners.get(child);
  if (lifetime?.parent === owner) detachOwnership(lifetime);
}

function synchronizeScopedIndex(owner: OwnershipRecord): void {
  const index = owner.scopedIndex;
  for (let child = owner.firstOwnedChild; child;) {
    const next = child.nextOwnedSibling;
    if (child.scope && !index?.has(child.scope)) detachOwnership(child);
    child = next;
  }
  if (index)
    for (const scope of Set.prototype.values.call(index))
      ownChild(owner, scope);
}

/** Compatibility collections are maintained indexes of the lifetime graph. */
export function getOwnedChildScopes(
  owner: OwnershipRecord
): Set<OwnedChildScope> | undefined {
  if (!owner.hadScopedChildren) return undefined;
  if (!owner.scopedIndex) {
    owner.scopedIndex = new Set();
    if (owner.disposed) return owner.scopedIndex;
    for (
      let child = owner.firstOwnedChild;
      child;
      child = child.nextOwnedSibling
    )
      if (child.scope) owner.scopedIndex.add(child.scope);
  }
  return owner.scopedIndex;
}

export function setOwnedChildScopes(
  owner: OwnershipRecord,
  scopes: Set<OwnedChildScope> | undefined
): void {
  owner.scopedIndex = scopes;
  owner.hadScopedChildren = scopes !== undefined;
  synchronizeScopedIndex(owner);
}

export function detachOwnedChildren(owner: OwnershipRecord): void {
  while (owner.firstOwnedChild) detachOwnership(owner.firstOwnedChild);
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

export interface DisposalPhases {
  begin?(): void;
  beforeCleanup?(): void;
  afterCleanup?(): void;
  finish?(): void;
  recordError(message: string, error: unknown): void;
}

/** Detach the exact lifetime, independently of its execution record. */
export function detachOwnership(owner: OwnershipRecord): void {
  const parent = owner.parent;
  if (!parent) return;
  if (owner.previousOwnedSibling)
    owner.previousOwnedSibling.nextOwnedSibling = owner.nextOwnedSibling;
  else parent.firstOwnedChild = owner.nextOwnedSibling;
  if (owner.nextOwnedSibling)
    owner.nextOwnedSibling.previousOwnedSibling = owner.previousOwnedSibling;
  else parent.lastOwnedChild = owner.previousOwnedSibling;
  if (owner.scope) parent.scopedIndex?.delete(owner.scope);
  owner.parent = undefined;
  owner.previousOwnedSibling = undefined;
  owner.nextOwnedSibling = undefined;
}

export function attachOwnership(
  owner: OwnershipRecord,
  parent: OwnershipRecord | undefined
): void {
  if (owner.parent === parent || owner.disposed) return;
  if (parent === owner) throw new Error('[Askr] A lifetime cannot own itself.');
  if (owner.firstOwnedChild) {
    for (let ancestor = parent; ancestor; ancestor = ancestor.parent)
      if (ancestor === owner)
        throw new Error('[Askr] Lifetime ownership cannot contain a cycle.');
  }
  detachOwnership(owner);
  if (!parent) return;
  if (parent.disposed) {
    disposeOwnership(owner);
    return;
  }
  linkOwnership(owner, parent);
}

function linkOwnership(owner: OwnershipRecord, parent: OwnershipRecord): void {
  owner.parent = parent;
  owner.previousOwnedSibling = parent.lastOwnedChild;
  if (parent.lastOwnedChild) parent.lastOwnedChild.nextOwnedSibling = owner;
  else parent.firstOwnedChild = owner;
  parent.lastOwnedChild = owner;
  if (owner.scope) {
    parent.hadScopedChildren = true;
    parent.scopedIndex?.add(owner.scope);
  }
}

interface DisposalFrame {
  owner: OwnershipRecord;
  phases: DisposalPhases;
  children: OwnershipRecord[];
  cursor: number;
  scopes: SetIterator<OwnedChildScope> | undefined;
  unreported: unknown[];
}

function defaultDisposalPhases(): DisposalPhases {
  const errors: unknown[] = [];
  return {
    recordError(_message, error) {
      errors.push(error);
    },
    finish() {
      if (errors.length)
        throw new AggregateError(errors, 'Owned cleanup failed');
    },
  };
}

function attemptDisposal(
  frame: DisposalFrame,
  message: string,
  run: () => void
): void {
  try {
    run();
  } catch (error) {
    try {
      frame.phases.recordError(message, error);
    } catch (reportError) {
      frame.unreported.push(reportError);
    }
  }
}

function prepareDisposal(
  owner: OwnershipRecord,
  phases?: DisposalPhases
): DisposalFrame {
  if (owner.scopedIndex) synchronizeScopedIndex(owner);
  const scopes = owner.scopedIndex?.size
    ? Set.prototype.values.call(owner.scopedIndex)
    : undefined;
  owner.disposed = true;
  detachOwnership(owner);
  const children: OwnershipRecord[] = [];
  for (let child = owner.firstOwnedChild; child; child = child.nextOwnedSibling)
    children.push(child);
  const frame: DisposalFrame = {
    owner,
    phases: phases ?? owner.lifecycle?.(owner) ?? defaultDisposalPhases(),
    children,
    cursor: 0,
    scopes,
    unreported: [],
  };
  if (scopes) owner.scopedIndex = undefined;
  if (frame.phases.begin)
    attemptDisposal(
      frame,
      '[Askr] owner preparation threw:',
      frame.phases.begin
    );
  return frame;
}

/** One iterative postorder drain for every lifetime, including deep chains. */
export function disposeOwnership(
  owner: OwnershipRecord,
  phases?: DisposalPhases
): void {
  if (owner.disposed) return;
  const stack = [prepareDisposal(owner, phases)];
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    const current = frame.owner;
    // A consumer may retain and mutate its assigned Set while cleanup runs.
    // Its live iterator selects lifetimes; the same drain still disposes them.
    if (frame.scopes) {
      const next = frame.scopes.next();
      if (!next.done) {
        const child = scopedOwnership(next.value);
        if (!child.disposed && (!child.parent || child.parent === current)) {
          if (!child.parent) linkOwnership(child, current);
          stack.push(prepareDisposal(child));
        }
        continue;
      }
    }
    if (frame.cursor < frame.children.length) {
      const child = frame.children[frame.cursor++]!;
      if (frame.scopes && child.scope) {
        if (child.parent === current) detachOwnership(child);
        continue;
      }
      if (!child.disposed && child.parent === current)
        stack.push(prepareDisposal(child));
      continue;
    }
    const attempt = (message: string, run: () => void) =>
      attemptDisposal(frame, message, run);
    if (frame.phases.beforeCleanup)
      attempt(
        '[Askr] readable subscription cleanup threw:',
        frame.phases.beforeCleanup
      );
    const cleanups = current.cleanups;
    current.cleanups = undefined;
    if (cleanups)
      for (const cleanup of cleanups)
        attempt('[Askr] cleanup function threw:', cleanup);
    if (frame.phases.afterCleanup)
      attempt(
        '[Askr] readable subscription cleanup threw:',
        frame.phases.afterCleanup
      );
    attempt('[Askr] abort controller cleanup threw:', () => {
      if (current.controller && !current.controller.signal.aborted)
        current.controller.abort(disposedSignal.reason);
    });
    current.controller = null;
    current.reads = undefined;
    current.mounted = false;
    const finalizer = current.finalizer;
    current.finalizer = undefined;
    if (finalizer)
      attempt('[Askr] owner finalization threw:', () => finalizer.release());
    try {
      frame.phases.finish?.();
    } catch (error) {
      frame.unreported.push(error);
    }
    current.scope = undefined;
    current.subject = undefined;
    current.lifecycle = undefined;
    stack.pop();
    if (frame.unreported.length) {
      const error =
        frame.unreported.length === 1
          ? frame.unreported[0]
          : new AggregateError(frame.unreported, 'Owned cleanup failed');
      const parent = stack[stack.length - 1];
      if (parent)
        attemptDisposal(parent, '[Askr] child ownership cleanup threw:', () => {
          throw error;
        });
      else throw error;
    }
  }
}
