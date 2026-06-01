# State Management

## Creating State

```ts
const [value, setValue] = state(initialValue);
```

`state()` returns a getter and setter pair:

- `getter()` reads the current value
- `setter(valueOrUpdater)` updates the value

When the state value itself is a function, always use updater form to replace
it. `setFormatter(() => nextFormatter)` is safe; a direct function argument is
interpreted as an updater.

## Derived State

```tsx
import { derive, state } from '@askrjs/askr';

function CounterSummary() {
  const [count] = state(0);
  const doubled = derive(() => count() * 2);

  return (
    <div>
      {count()} doubled is {doubled()}
    </div>
  );
}
```

`derive()` returns a callable getter derived from other reactive inputs.

Resource snapshots from `resource()` are not readable sources. Use
`derive(snapshot, map)` or read `resource.value` in JSX; resource updates still
trigger a component re-render when async work completes.

## Keyed Selectors

Use `selector()` when one source fans out to many keyed readers, such as row selection
or active-route checks.

```tsx
import { selector, state } from '@askrjs/askr';

function TableRow({ row }: { row: { id: number } }) {
  const [selectedId] = state<number | null>(null);
  const isSelected = selector(selectedId);

  return <tr class={isSelected(row.id) ? 'danger' : ''} />;
}
```

For keyed lists, create the selector once in the owner component and pass it down.

```tsx
import { selector, state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';

type RowData = { id: number };

function Table({ rows }: { rows: RowData[] }) {
  const [selectedId, setSelectedId] = state<number | null>(null);
  const isSelected = selector(selectedId);

  return (
    <For each={rows} by={(row) => row.id}>
      {(row) => (
        <Row
          row={row}
          isSelected={isSelected}
          onSelect={() => setSelectedId(row.id)}
        />
      )}
    </For>
  );
}
```

## Control Flow

Use `Show`, `Case`, and `Match` for conditional control flow.

```tsx
import { Case, Match, Show } from '@askrjs/askr/control';

function Example({
  user,
  status,
}: {
  user: { id: string } | null;
  status: () => 'loading' | 'ready';
}) {
  return (
    <>
      <Show when={user} fallback={<Login />}>
        {(value) => <Dashboard user={value} />}
      </Show>

      <Case fallback={<NotFound />}>
        <Match when={status() === 'loading'}>
          <Spinner />
        </Match>
        <Match when={status() === 'ready'}>
          <Dashboard />
        </Match>
      </Case>
    </>
  );
}
```

`Case` only accepts direct `Match` children. Each `Match` renders either a
plain JSX node or a zero-argument thunk.

`Show` render functions receive the resolved truthy value. Literal falsey
branches such as `null`, `undefined`, `false`, `''`, and `0` are excluded from
the callback type when TypeScript can see them.

Control-flow fallbacks and `Match` thunk children accept normal JSX boundary
content, including fragments and sibling arrays.

## Rules

1. Call `state()` at top level.
2. Call `derive()` and `selector()` at top level.
3. Keep call order stable across renders.
4. Do not mutate during render.

These rules are enforced at runtime.
