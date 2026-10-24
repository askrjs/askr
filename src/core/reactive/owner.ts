/**
 * Owner tree.
 *
 * Every lifetime in the runtime (a root, a component, a control boundary, a
 * list row, a binding) is an Owner. Disposal runs children first, in reverse
 * creation order, then the owner's own cleanups in reverse registration
 * order. It always finishes; failures are collected and returned.
 */

export type Cleanup = () => void;

/**
 * Bumped whenever scope values or the owner tree change shape. Cached scope
 * lookups are valid only within the epoch they were stored in.
 */
let scopeEpoch = 0;

/** Distance between cached owners on a compressed lookup path. */
const SCOPE_CACHE_STRIDE = 8;

export class Owner {
  parent: Owner | null;
  /**
   * Owned children in creation order. A detached child leaves a `null` hole
   * so detaching is O(1); holes are compacted once they dominate the list.
   */
  owned: Array<Owner | null> | null = null;
  /** Holes in `owned`. */
  ownedHoles = 0;
  /** This owner's index in `parent.owned`. */
  ownedIndex = -1;
  cleanups: Cleanup[] | null = null;
  /** Lexical scope values keyed by scope identity; inherited through `parent`. */
  context: Map<unknown, unknown> | null = null;
  /** Resolved scope lookups through this owner, valid for `scopeCacheEpoch`. */
  scopeCache: Map<unknown, unknown> | null = null;
  scopeCacheEpoch = -1;
  disposed = false;

  constructor(parent: Owner | null) {
    this.parent = parent;
    if (parent) {
      // A lifetime that starts after its parent ended (an async continuation
      // after unmount) is over before it begins: it is never scheduled and
      // never subscribes, and its cleanups run as they are registered.
      if (parent.disposed) {
        this.disposed = true;
        return;
      }
      const owned = (parent.owned ??= []);
      this.ownedIndex = owned.length;
      owned.push(this);
    }
  }

  onCleanup(fn: Cleanup): void {
    if (this.disposed) {
      fn();
      return;
    }
    (this.cleanups ??= []).push(fn);
  }

  /** Record a scope value on this owner, visible to it and its descendants. */
  setContext(key: unknown, value: unknown): void {
    (this.context ??= new Map()).set(key, value);
    scopeEpoch++;
  }

  /** Remove a scope value recorded with {@link setContext}. */
  deleteContext(key: unknown): void {
    this.context?.delete(key);
    scopeEpoch++;
  }

  lookup(key: unknown): unknown {
    return this.lookupScope(key, undefined);
  }

  /**
   * Find the nearest value recorded under `key` on this owner or an ancestor,
   * or `notFound`. The result is cached on owners along the walk (every
   * {@link SCOPE_CACHE_STRIDE}th one, so a chain of any depth is walked about
   * once per change), and a later lookup stops at the first cached owner.
   */
  lookupScope<T>(key: unknown, notFound: T): unknown {
    const epoch = scopeEpoch;
    let found: unknown = notFound;
    let steps = 0;
    let owner: Owner | null = this;
    for (; owner; owner = owner.parent) {
      if (owner.scopeCacheEpoch === epoch && owner.scopeCache?.has(key)) {
        found = owner.scopeCache.get(key);
        break;
      }
      const context = owner.context;
      if (context?.has(key)) {
        found = context.get(key);
        break;
      }
      steps++;
    }
    if (steps >= SCOPE_CACHE_STRIDE) {
      let index = 0;
      for (let o: Owner | null = this; index < steps; o = o!.parent, index++) {
        if (index % SCOPE_CACHE_STRIDE !== 0) continue;
        if (o!.scopeCacheEpoch !== epoch || !o!.scopeCache) {
          o!.scopeCache = new Map();
          o!.scopeCacheEpoch = epoch;
        }
        o!.scopeCache.set(key, found);
      }
    }
    return found;
  }

  /** Detach from the parent without disposing (the caller disposes). */
  detach(): void {
    const parent = this.parent;
    // Descendants may have cached values from the ancestors being left.
    if (parent && (this.owned || this.scopeCache)) scopeEpoch++;
    const siblings = parent?.owned;
    if (parent && siblings && siblings[this.ownedIndex] === this) {
      if (this.ownedIndex === siblings.length - 1) {
        siblings.pop();
        // Trailing holes are dropped with the last child.
        while (siblings.length && siblings[siblings.length - 1] === null) {
          siblings.pop();
          parent.ownedHoles--;
        }
      } else {
        siblings[this.ownedIndex] = null;
        parent.ownedHoles++;
        if (parent.ownedHoles > 16 && parent.ownedHoles * 2 > siblings.length) {
          compactOwned(parent, siblings);
        }
      }
    }
    this.parent = null;
    this.ownedIndex = -1;
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

function compactOwned(parent: Owner, siblings: Array<Owner | null>): void {
  let next = 0;
  for (const child of siblings) {
    if (!child) continue;
    child.ownedIndex = next;
    siblings[next++] = child;
  }
  siblings.length = next;
  parent.ownedHoles = 0;
}

/** Take `owner`'s children, leaving it with none. */
function takeOwned(owner: Owner): Array<Owner | null> | null {
  const owned = owner.owned;
  owner.owned = null;
  owner.ownedHoles = 0;
  return owned;
}

function disposeChildren(owner: Owner, errors: unknown[]): void {
  const owned = takeOwned(owner);
  if (!owned) return;
  for (let i = owned.length - 1; i >= 0; i--) {
    const child = owned[i];
    if (!child) continue;
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
  const pending: Array<{ owner: Owner; finish: boolean; detach?: boolean }> = [
    { owner, finish: false },
  ];
  while (pending.length) {
    const frame = pending.pop()!;
    const current = frame.owner;
    if (frame.finish) {
      runCleanups(current, errors);
      try {
        (current as unknown as { onDispose(): void }).onDispose();
      } catch (error) {
        errors.push(error);
      }
      continue;
    }
    if (frame.detach) current.parent = null;
    if (current.disposed) continue;
    current.disposed = true;
    pending.push({ owner: current, finish: true });
    const children = takeOwned(current);
    if (!children) continue;
    for (const child of children) {
      if (child) pending.push({ owner: child, finish: false, detach: true });
    }
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
