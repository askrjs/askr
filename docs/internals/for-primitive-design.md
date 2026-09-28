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

## Controls are components

`Show`, `Case`, and `For` (`src/core/api/control.ts`) are ordinary lazy
components. Each renders in its own lifetime, reads its sources (`when`,
`each`) in its own render, and never claims hook slots in the component that
uses it. A control therefore works under `if`, ternaries, early returns, and
loops, and a change to its source re-renders the control, not the parent.

The core provides everything else: owner lifetimes, reactive tracking, scheduling,
and cleanup (see [runtime reactivity](./runtime-reactivity.md)). The controls own
only:

- branch selection
- row keys and key validation
- fallback selection
- child validation

A branch is wrapped in a keyed fragment, so switching branches replaces the
branch's lifetime instead of patching one branch's DOM into the other's.

## For

- keyed mode: `each`, `by`, `fallback`, `children`
- positional mode: `each`, `byIndex={true}`, `fallback`, `children`
- `by` and `byIndex` are mutually exclusive
- missing both is a hard error

`For` renders one `ForRow` component per item, keyed by the row key. Rows are
placed by the renderer's single keyed reconciler, with one
longest-increasing-subsequence move pass. There are no list-specific fast
paths; see the [renderer pipeline](./renderer-pipeline.md#reconciliation).

Each live key keeps one row record, held in a hook slot on the `For` instance:

- an index signal, read by the row's `index()` accessor
- an item signal
- one signal per item property a row has read

A row re-renders when its item or the row callback changes. When an item is
replaced, the row writes each property signal that something has read, so
fine-grained readers of unchanged properties are not notified. Object items are exposed
through a proxy that reads through those property signals. Arrays and
primitives pass through unchanged. Assigning to a proxied item property
shadows the source value, and development builds warn when the name collides
with a source property.

Every render validates keys before reconciling: `null`, `undefined`, and
duplicate keys within one list throw. Keys are compared by identity, so numeric
`1` and string `'1'` are different keys. A validation error discards the render
pass and reaches the nearest `ErrorBoundary` above the `For`.

Row records are pruned when the render commits. Row changes made during a
render that is then discarded are undone through the render journal. An empty
list renders `fallback` as its own branch.

## Show

`Show` renders `children` while `when` is truthy and `fallback` otherwise. The
two branches have separate keys (`show:when`, `show:fallback`), so a switch
disposes one branch's lifetime and creates the other. Function children receive
the resolved truthy value.

## Case and Match

`Case` scans its direct `Match` children, renders the first whose `when` is
truthy, and falls back to `fallback`.

- the branch key combines the match position with the `Match` key, so
  reordering or re-keying matches replaces the branch
- `fallback` is prop-only
- a direct child that is not `Match` throws when the `Case` renders, so the
  nearest `ErrorBoundary` around the `Case` catches it

`Match` only describes a branch:

```ts
type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: JSXNode | (() => JSXNode);
};
```

Rendering `Match` outside `Case` throws in every build.

## Disposal

A control's rows and branches are owners in the owner tree. Removing a row or
switching a branch disposes its owner: children first, then cleanups, with
failures collected rather than stopping teardown. Disposing the component that
rendered the control disposes the control and everything it owns.
