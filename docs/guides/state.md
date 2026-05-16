# State Management

## Creating State

```ts
const [value, setValue] = state(initialValue);
```

`state()` returns a getter and setter pair:

- `getter()` reads the current value
- `setter(valueOrUpdater)` updates the value

## Derived State

```ts
import { derive, state } from '@askrjs/askr';

const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);

return <div>{count()} doubled is {doubled()}</div>;
```

`derive()` returns a callable getter derived from other reactive inputs.

## Keyed Selectors

Use `selector()` when one source fans out to many keyed readers, such as row selection
or active-route checks.

```ts
import { selector, state } from '@askrjs/askr';

const [selectedId, setSelectedId] = state<number | null>(null);
const isSelected = selector(selectedId);

return <tr class={() => (isSelected(row.id) ? 'danger' : '')} />;
```

For keyed lists, create the selector once in the owner component and pass it down.

```ts
import { selector, state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';

function Table() {
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

## Rules

1. Call `state()` at top level.
2. Call `derive()` and `selector()` at top level.
3. Keep call order stable across renders.
4. Do not mutate during render.

These rules are enforced at runtime.
