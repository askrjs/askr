# Control-Flow Primitive Design

This note documents the current control-flow model for `@askrjs/askr`.

## Public API

```tsx
import { Case, For, Match, Show } from '@askrjs/askr/control';

const rows = [{ id: 1 }];
const user: { id: string } | null = { id: '1' };
const status: () => 'loading' | 'ready' = () => 'loading';

<For each={rows} by={(row) => row.id} fallback={<EmptyState />}>
  {(row, index) => <Row row={row} index={index()} />}
</For>;

<Show when={user} fallback={<Login />}>
  {(value) => <Dashboard user={value} />}
</Show>;

<Case fallback={<NotFound />}>
  <Match when={status() === 'loading'}>
    <Spinner />
  </Match>

  <Match when={status() === 'ready'}>
    <Dashboard />
  </Match>
</Case>;
```

`For` is JSX-only. Stable keyed identity requires `by`. Positional identity is opt-in through `byIndex={true}`. Keys are typed identities: numeric `1` and string `'1'` are different keys, while a key must retain its own type across renders. The canonical feature subpath for these primitives is `@askrjs/askr/control`.

## Core Runtime Primitive

Control flow is built on runtime-owned child scopes:

```ts
interface ChildScope {
  key: string | number;
  render(fn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}
```

The runtime owns:

- component instance switching
- state index reset and restore
- reactive read tracking and finalization
- scheduler integration
- cleanup and disposal

The control primitives own only:

- branch selection
- keyed reconciliation
- ordered output
- fallback selection
- child and key validation

## Control Boundary VNodes

`For`, `Show`, and `Case` are eager JSX primitives. During parent render they allocate persistent boundary state and return a small internal control-boundary vnode.

The renderer recognizes that boundary and delegates to runtime state:

- `ForState`
- `ShowState`
- `CaseState`

`Match` is metadata-only. `Case` reads its direct children and turns them into branch descriptors. `Match` does not render independently.

## For

`For` is a thin keyed reconciliation layer over child scopes.

- keyed mode: `each`, `by`, `fallback`, `children`
- positional mode: `each`, `byIndex={true}`, `fallback`, `children`
- `by` and `byIndex` are mutually exclusive
- missing both is a hard error

Each live key owns:

- one `ChildScope`
- one reactive index accessor
- one cached vnode
- one cached DOM root

Reconciliation strategy and key validation live in
`src/runtime/control/for-reconcile.ts`. Item and fallback child scopes live in
`src/runtime/control/for-scopes.ts`. Reactive item and index accessor mechanics live in
`src/runtime/control/for-signals.ts`; the scope owner calls into that helper to create
row-local item signals, proxy object/function property reads, pass array items
through as native arrays, notify readable subscribers, and prune parent readers
when a row updates without rerendering the owning component.

Every build rejects null or undefined keys and duplicate keys within one list
before reconciling, using one `Set` per pass: the reconciliation paths address
rows by key, so letting a violation through would silently drop or merge rows.
Only the check for keys whose string or number type changes across renders is
development-only, since it keeps a `Map` across passes. A validation error
rolls the `For` transaction back and reaches the nearest `ErrorBoundary`: on
mount through the boundary's own render, and on a boundary-local update
through the control boundary commit, which routes failures to the boundary
around where the `For` was materialized.

The `each` source is owned by the `For` boundary itself. List-source reads are tracked through a boundary-local fine-grained effect, so source changes dirty the `For` boundary instead of subscribing the parent component render. Same-order keyed updates can therefore stay row-local, while append, truncate, and reorder work still flow through keyed reconciliation.

The runtime keeps the existing fast lanes:

- `APPEND`
- `TRUNCATE`
- `NO_REORDER`
- `SWAP`
- `FULL_KEYED`

Fallback rendering also uses a child scope, so empty-list behavior follows the same lifecycle and cleanup rules as keyed rows.

## Show

`Show` keeps one truthy child scope and one fallback child scope.

- when the condition stays truthy, the truthy scope is reused
- when the condition switches to falsy, the truthy scope is disposed
- when fallback becomes active, it is rendered through its own scope

Function children receive the resolved truthy value. Static children are rendered inside the active scope.

## Case and Match

`Case` owns selection and lifecycle. It scans direct `Match` children, picks the first truthy branch, and renders only that branch.

- selected branch key: an internal branch identity derived from match position plus user key
- fallback is prop-only
- replaced branches are disposed immediately
- a direct child that is not `Match` throws in every build when the `Case` is evaluated, so the nearest `ErrorBoundary` around the `Case` catches it

`Match` only describes a branch:

```ts
type MatchProps = {
  when: unknown;
  children: JSXNode | (() => JSXNode);
};
```

Using `Match` outside `Case` throws in every build.

## Disposal Model

When a child scope is disposed:

- readable subscriptions are cleaned up
- cleanup hooks run
- owned child scopes are released
- cached vnode and DOM references are cleared

Parent component cleanup disposes all owned child scopes automatically, which keeps control-flow lifecycles bounded to the owning render tree.
