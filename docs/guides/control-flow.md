# Reactive control flow

`<For>` keeps stable rows by key. Each row is a child scope that keeps its DOM
and local state for as long as its key stays in the list. The `children`
callback reruns an existing row, without remounting it, when:

- the row's item changes, or a property of the item that the row read changes;
- the parent component rerenders and passes a new row callback, so the row
  renders with the latest closure (an inline arrow is a new callback on every
  parent render);
- a reactive value that the callback read directly, such as a parent `state()`
  getter, changes. The read subscribes the row, not the parent.

Keys passed to `by` must be stable, non-null, and unique within the list. Keys
are compared by identity, so `1` and `'1'` are different keys: changing a key's
type remounts that row. Every build throws a descriptive error for a null,
undefined, or duplicate key, because rows are addressed by key and reconciling
them would silently drop or merge rows. The error is raised while the list
renders or updates, so the nearest `<ErrorBoundary>` around the `<For>` renders
its fallback, including when the list sits inside a `<Show>` or `<Case>` branch;
without one, the error propagates from the render or scheduler flush.

## Selected-row state

Use `selector()` for a keyed membership test. Only rows whose membership
changes need to update:

```tsx
import { selector, state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';

const ITEMS = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

export function Navigation() {
  const [selected, setSelected] = state('a');
  const isSelected = selector(() => selected());

  return (
    <>
      <button onClick={() => setSelected('c')}>Choose C</button>
      <For each={ITEMS} by={(item) => item.id}>
        {(item) => (
          <a data-active={isSelected(item.id) ? 'true' : 'false'}>{item.id}</a>
        )}
      </For>
    </>
  );
}
```

`selector()` is declared during component render and can be called from each
row. It tracks the source once and exposes a predicate for each item key.

## Updating one DOM property

When the row itself does not need to rerun, use a function-valued prop (a
thunk). The renderer reevaluates the property when its reactive source changes:

```tsx
<For each={ITEMS} by={(item) => item.id}>
  {(item) => (
    <li data-active={() => (selected() === item.id ? 'true' : 'false')}>
      {item.id}
    </li>
  )}
</For>
```

## Parent values in row callbacks

A value the parent computes during render and captures in the row callback
reaches existing rows on the next parent render:

```tsx
const current = selected();

<For each={ITEMS} by={(item) => item.id}>
  {(item) => <li data-active={item.id === current ? 'true' : 'false'} />}
</For>;
```

This is correct but broad: the parent rerenders because it read `selected()`,
and every row reruns with the new closure. Reading `selected()` inside the
callback instead leaves the parent alone but still reruns every row that read
it. Prefer `selector()` or a thunk prop when only a few rows or one property
should update. When rows do not depend on parent render values, pass a stable
callback (declared outside the component) so unrelated parent renders do not
rerun them.

Keys still need to be stable; use `byIndex` only when positional identity is
intentional.

## Testing the contract

This repository's Vitest/jsdom test harness can mount this component. Keep the
state update and the row assertion in the same test so a row that did not
update cannot pass unnoticed:

```text
const active = () =>
  [...document.querySelectorAll('[data-active="true"]')].map(
    (node) => node.textContent
  );

expect(active()).toEqual(['a']);
document.querySelector('button')?.dispatchEvent(new MouseEvent('click'));
await waitForNextEvaluation();
expect(active()).toEqual(['c']);
```

`waitForNextEvaluation()` is provided by the repository test setup; it is not
part of the published `@askrjs/askr` package.

## Keep control boundaries in the render sequence

`<For>`, `<Show>`, and the other eager control primitives retain
render-scoped state. Do not make the primitive call itself appear or disappear
behind a plain `if`, ternary, `&&` branch, or changing loop:

```tsx
function Rows() {
  // Avoid: the For call is skipped while open() is false.
  return (
    <div>
      {open() ? (
        <For each={items} by={(item) => item.id}>
          {(item) => <Row item={item} />}
        </For>
      ) : null}
    </div>
  );
}
```

Keep the outer control boundary unconditional and put the conditional branch
inside `<Show>`, or use a `<Case>` boundary with `<Match>` children:

```tsx
<Show when={open}>
  {() => (
    <For each={items} by={(item) => item.id}>
      {(item) => <Row item={item} />}
    </For>
  )}
</Show>
```

This rule is about primitives evaluated in the current component's render
scope. A normal JSX child such as `<Dialog />` is reconciled as its own
component instance; its internal hooks do not become conditional hooks in the
parent merely because the parent selected that child with ordinary JavaScript.
