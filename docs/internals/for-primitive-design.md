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

`For` is JSX-only. Stable keyed identity requires `by`. Positional identity is opt-in through `byIndex={true}`. The canonical feature subpath for these primitives is `@askrjs/askr/control`.

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
- development validation

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
- invalid direct children throw in development

`Match` only describes a branch:

```ts
type MatchProps = {
  when: unknown;
  children: JSXNode | (() => JSXNode);
};
```

Using `Match` outside `Case` throws in development and returns `null` in production.

## Disposal Model

When a child scope is disposed:

- readable subscriptions are cleaned up
- cleanup hooks run
- owned child scopes are released
- cached vnode and DOM references are cleared

Parent component cleanup disposes all owned child scopes automatically, which keeps control-flow lifecycles bounded to the owning render tree.
