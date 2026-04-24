# `For` Primitive Design

## Type Signature

```typescript
interface ForOptions<T> {
  by?: (item: T, index: number) => string | number;
  fallback?: VNode;
}

function For<T>(
  source: State<T[]> | (() => T[]),
  render: (item: T, index: () => number) => VNode,
  options?: ForOptions<T>
): VNode;
```

## Semantics

### Ownership Boundary

`For` creates a **reactivity firewall**:

- Parent component reads `source()` once during parent render
- `For` returns a special marker vnode: `{ type: __FOR_BOUNDARY__, ... }`
- Renderer recognizes marker and delegates to `For` runtime
- Each item gets an isolated child scope owned by the runtime
- Item updates do NOT invalidate parent

### Keying Strategy

```typescript
// Default: Use item.id if present, else index
const defaultKey = (item: T, index: number) => (item as any).id ?? index;

// Explicit keying via options
For(rows, (row) => Row({ row }), { by: (row) => row.id });
```

Keys are expected to be stable, non-null, and unique within a list. The runtime
currently preserves production behavior for invalid keys, but emits dev-only
warnings for `null` / `undefined` keys and duplicates.

### Array Diffing

On `source` change:

1. Read new array value
2. Build new key map: `Map<Key, { item: T, index: number }>`
3. Compare with previous key map
4. Identify: added, removed, moved, updated items
5. Only re-execute render for updated items
6. Reconcile resulting vnodes with keyed reconciler

### Item Instance Lifecycle

Each item has:

```typescript
interface ChildScope {
  key: string | number | null;
  componentInstance: ComponentInstance;
  vnode: VNode | undefined;
  dom?: Node;
  needsDomUpdate: boolean;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}

interface ForItemInstance {
  key: string | number;
  item: T;
  indexSignal: State<number>; // reactive index facade
  scope: ChildScope;
}
```

When item data changes (object identity or by shallow equality):

- `For` reuses the existing child scope for that key
- The runtime re-runs the scope render with the original hook/state index seed
- The scope updates its cached vnode and marks its DOM as dirty
- `For` keeps ownership of ordered keys, diff strategy selection, and ordered vnode output

When nested state inside a row changes:

- The row's child scope is scheduled through the normal readable/state pipeline
- The scope re-renders itself and finalizes its subscriptions
- The scope asks the parent `For` boundary owner to enqueue a render so DOM updates can commit

## Runtime Integration Points

### 1. New VNode Type

```typescript
// src/common/vnode.ts
export const __FOR_BOUNDARY__ = Symbol('__FOR_BOUNDARY__');

export interface ForBoundaryVNode {
  type: typeof __FOR_BOUNDARY__;
  props: {
    source: State<unknown[]> | (() => unknown[]);
    render: (item: unknown, index: () => number) => VNode;
    by?: (item: unknown, index: number) => string | number;
    fallback?: VNode;
  };
  children: VNode[]; // cached children for reconciler
  _forState?: ForState; // internal state (item instances)
}
```

### 2. For State Management

```typescript
// src/runtime/for.ts
interface ForState<T> {
  sourceState: State<T[]> | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedVNodes: VNode[];
  byFn: (item: T, index: number) => string | number;
  renderFn: (item: T, index: () => number) => VNode;
  parentInstance: ComponentInstance;
  mounted: boolean;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
}
```

### 3. Evaluate Integration

```typescript
// src/renderer/evaluate.ts

function evaluateVNode(vnode: VNode, parent: Element): void {
  if (vnode.type === __FOR_BOUNDARY__) {
    evaluateForBoundary(vnode as ForBoundaryVNode, parent);
    return;
  }
  // ... existing logic
}

function evaluateForBoundary(vnode: ForBoundaryVNode, parent: Element): void {
  const forState = vnode._forState || initializeForState(vnode);
  const currentArray =
    typeof vnode.props.source === 'function'
      ? vnode.props.source()
      : vnode.props.source();

  // Diff array, update item instances, rebuild children
  const newChildren = reconcileForItems(forState, currentArray);
  vnode.children = newChildren;

  // Now reconcile resulting vnodes normally
  reconcileKeyed(parent, newChildren, extractKeyMap(parent));
}
```

### 4. Child Scope Creation

```typescript
// src/runtime/child-scope.ts

function createChildScope(
  parent: ComponentInstance | null,
  key: string | number | null,
  onDirty?: () => void
): ChildScope;

function rerenderChildScope(scope: ChildScope): VNode | undefined;

function disposeChildScope(scope: ChildScope): void;
```

`ChildScope` is the runtime-owned abstraction that encapsulates:

- current component switching
- state index restore/reset
- render token assignment
- readable subscription finalization
- per-row scheduling via `_pendingFlushTask`
- cached vnode and cached DOM ownership

`For` consumes that primitive rather than mutating component internals directly.

### 5. Item Instance Creation

```typescript
// src/runtime/for.ts

function createItemInstance<T>(
  key: string | number,
  item: T,
  index: number,
  forState: ForState<T>
): ForItemInstance<T> {
  const indexSignal = createForIndexSignal(index);
  const scope = createChildScope(forState.parentInstance, key, () => {
    forState.parentInstance?._enqueueRun?.();
  });

  const vnode = scope.render(() =>
    evaluateJSXElement(forState.renderFn(item, indexSignal))
  );

  materializeItemVnode(key, vnode);

  return {
    key,
    item,
    indexSignal,
    scope,
  };
}
```

### 6. Array Reconciliation

```typescript
// src/runtime/for.ts

function reconcileForItems<T>(forState: ForState<T>, newArray: T[]): VNode[] {
  validateForKeys(forState, newArray); // dev-only diagnostics

  // Choose the cheapest valid strategy first.
  // Fast lanes are preserved for append, truncate, same-order updates, swaps,
  // and the fully keyed slow path.
  if (canUseAppendPath(forState, newArray)) {
    return reconcileAppend(forState, newArray);
  }

  if (canUseTruncatePath(forState, newArray)) {
    return reconcileTruncate(forState, newArray);
  }

  if (canUseNoReorderPath(forState, newArray)) {
    return reconcileNoReorder(forState, newArray);
  }

  if (canUseSwapPath(forState, newArray)) {
    return reconcileSwap(forState, newArray);
  }

  return reconcileFullKeyed(forState, newArray);
}
```

The renderer still owns DOM commit strategy. `For` records `pendingDirtyIndices`,
`pendingSwapIndices`, and `lastCommitStrategy`, while the child scope owns the
cached vnode, cached DOM node, and dirty flag that the commit helpers consume.

## User API

### Basic Usage

```typescript
import { For, state } from 'askr';

const Component = () => {
  const rows = state<Row[]>([...]);

  return {
    type: 'div',
    children: [
      For(rows, (row) => ({
        type: 'div',
        props: { key: row.id },
        children: [row.label]
      }))
    ]
  };
};
```

### With Custom Key

```typescript
For(items, (item) => Item({ item }), { by: (item) => item.uid });
```

### With Reactive Index

```typescript
For(items, (item, index) => ({
  type: 'div',
  children: [`${index()}: ${item.label}`],
}));
```

### With Fallback

```typescript
For(items, (item) => Item({ item }), {
  fallback: { type: 'div', children: ['No items'] },
});
```

## Execution Model

### Parent Render

```typescript
const Component = () => {
  const rows = state(createRows(1000));

  // Parent reads rows() ONCE during this execution
  // Returns For boundary vnode
  // Parent does NOT re-execute when individual rows update
  return {
    type: 'div',
    children: [For(rows, (row) => RowComponent(row))],
  };
};
```

### Item Update Flow

```typescript
// Update every 10th row
rows.set(
  rows().map((r, i) => (i % 10 === 0 ? { ...r, label: r.label + '!' } : r))
);
```

**Execution trace:**

1. `rows.set()` invalidates subscribers
2. Parent component does NOT re-execute (not subscribed to rows directly)
3. `For` boundary evaluates new array
4. Diff detects ~100 changed items (by object identity)
5. Only those 100 item instances re-execute
6. 900 unchanged items use cached vnodes
7. Keyed reconciler updates only changed DOM nodes

**Result:** 100 executions instead of 1000

## Rules for Usage

### MUST use `For` when:

- Rendering arrays
- Items can update independently
- List size > 10 items

### MAY use `.map()` when:

- Static arrays (no updates)
- Derived display data (no item identity)
- Parent re-execution is intentional

### MUST NOT:

- Nest `For` render functions with parent state reads
- Return `For` from conditional branches (wrap in fragment)
- Use `For` for non-array iteration

## Integration with Existing Code

### State Subscription Model

```typescript
// Current: Parent subscribes to state
const rows = state([...]);
const currentRows = rows();  // Parent subscribes

// With For: For subscribes, parent does not
For(rows, (row) => ...)  // For subscribes, parent unaffected
```

### Scheduler Integration

Each item instance has its own component:

- Uses existing `scheduleComponent()`
- Flushes normally via scheduler
- No new scheduler primitives needed

### Reconciler Integration

`For` produces flat vnode array:

- Keyed vnodes with stable keys
- Works with existing `reconcileKeyedChildren()`
- No changes to reconciler needed

## Benchmark Update

### Before

```typescript
const Component = () => {
  rows = state(createRows(1000));
  const currentRows = rows();
  const children = [];
  for (let i = 0; i < currentRows.length; i++) {
    const row = currentRows[i];
    children.push({
      type: 'div',
      props: { key: row.id },
      children: [String(row.label)],
    });
  }
  return { type: 'div', children };
};

// Result: 1000 executions on update
```

### After

```typescript
const Component = () => {
  const rows = state(createRows(1000));

  return {
    type: 'div',
    children: [
      For(rows, (row) => ({
        type: 'div',
        props: { key: row.id },
        children: [String(row.label)],
      })),
    ],
  };
};

// Result: ~100 executions on update
```

## Implementation Checklist

- [ ] Add `__FOR_BOUNDARY__` symbol to vnode types
- [ ] Create `src/runtime/for.ts` with ForState and reconciliation logic
- [ ] Add `For()` function export to main index
- [ ] Integrate `evaluateForBoundary()` into renderer/evaluate.ts
- [ ] Add item instance management (create/update/unmount)
- [ ] Implement array diffing with key extraction
- [ ] Update benchmark to use `For`
- [ ] Verify ~100 executions instead of 1000
- [ ] Add tests for add/remove/move/update scenarios
- [ ] Document when to use `For` vs `.map()`

## Performance Characteristics

### Memory

- O(n) item instances for n items
- Each instance: component state + vnode cache
- Bounded by list size, not update frequency

### CPU

- Initial render: O(n) - create all item instances
- Update: O(changed items) - only re-execute changed items
- Reconciliation: O(n log n) - keyed diffing unchanged

### Invalidation Width

- Current: Component-level (1000 executions)
- With For: Item-level (~100 executions)
- Reduction: 10x for update-every-10th pattern

## Correctness Guarantees

1. **Determinism**: Same input array → same output vnodes
2. **Identity**: Keys preserved across updates
3. **Ordering**: Array order matches DOM order after reconciliation
4. **Isolation**: Item updates don't affect parent or siblings
5. **Cleanup**: Removed items properly unmounted

## Non-Features (Intentionally Omitted)

- No automatic memoization of item render functions
- No dependency tracking within item render
- No shallow equality checks on item data
- No virtualization or windowing
- No transition animations (separate concern)
- No `each` vs `for` variants (one primitive only)
