/**
 * Owner tree.
 *
 * Every lifetime in the runtime (a root, a component, a control boundary, a
 * list row, a binding) is an Owner. Disposal runs children first, in reverse
 * creation order, then the owner's own cleanups in reverse registration
 * order. It always finishes; failures are collected and returned.
 */

export type Cleanup = () => void;

export class Owner {
  parent: Owner | null;
  owned: Owner[] | null = null;
  cleanups: Cleanup[] | null = null;
  /** Lexical scope values keyed by scope identity; inherited through `parent`. */
  context: Map<unknown, unknown> | null = null;
  disposed = false;

  constructor(parent: Owner | null) {
    this.parent = parent;
    if (parent) {
      (parent.owned ??= []).push(this);
    }
  }

  onCleanup(fn: Cleanup): void {
    if (this.disposed) {
      fn();
      return;
    }
    (this.cleanups ??= []).push(fn);
  }

  lookup(key: unknown): unknown {
    if (this.context?.has(key)) return this.context.get(key);
    return this.parent?.lookup(key);
  }

  /** Detach from the parent without disposing (the caller disposes). */
  detach(): void {
    const siblings = this.parent?.owned;
    if (siblings) {
      const index = siblings.lastIndexOf(this);
      if (index >= 0) siblings.splice(index, 1);
    }
    this.parent = null;
  }

  /**
   * Dispose this owner and everything it owns. Returns the failures instead of
   * throwing so a caller can decide whether to report or aggregate them.
   */
  dispose(errors: unknown[] = []): unknown[] {
    if (this.disposed) return errors;
    this.detach();
    disposeTree(this, errors);
    return errors;
  }

  /** Dispose owned children and run cleanups, keeping this owner alive. */
  reset(errors: unknown[] = []): unknown[] {
    disposeChildren(this, errors);
    runCleanups(this, errors);
    return errors;
  }

  protected onDispose(): void {}
}

function disposeChildren(owner: Owner, errors: unknown[]): void {
  const owned = owner.owned;
  if (!owned) return;
  owner.owned = null;
  for (let i = owned.length - 1; i >= 0; i--) {
    const child = owned[i];
    child.parent = null;
    disposeTree(child, errors);
  }
}

function runCleanups(owner: Owner, errors: unknown[]): void {
  const cleanups = owner.cleanups;
  if (!cleanups) return;
  owner.cleanups = null;
  for (let i = cleanups.length - 1; i >= 0; i--) {
    try {
      cleanups[i]();
    } catch (error) {
      errors.push(error);
    }
  }
}

function disposeTree(owner: Owner, errors: unknown[]): void {
  if (owner.disposed) return;
  owner.disposed = true;
  disposeChildren(owner, errors);
  runCleanups(owner, errors);
  try {
    (owner as unknown as { onDispose(): void }).onDispose();
  } catch (error) {
    errors.push(error);
  }
}

let currentOwner: Owner | null = null;

export function getOwner(): Owner | null {
  return currentOwner;
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const previous = currentOwner;
  currentOwner = owner;
  try {
    return fn();
  } finally {
    currentOwner = previous;
  }
}

export function throwCollected(errors: unknown[], message: string): void {
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, message);
}
