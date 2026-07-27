# Reactive control flow

`<For>` keeps stable rows by key. Its `children` callback runs when a row is
created or reconciled; it is not a general reactive scope. This distinction is
important when a row reads state owned by the parent component.

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

## Avoid plain closure captures

This looks natural but freezes the initial value for an existing row:

```tsx
const current = selected();

<For each={ITEMS} by={(item) => item.id}>
  {(item) => <li data-active={item.id === current ? 'true' : 'false'} />}
</For>;
```

`current` is read while the parent renders, but the row callback does not
subscribe to that read. Replace it with `selector()` or a thunk prop.

The same rule applies to any parent `state()`, `derive()`, or reactive getter
captured by a row callback. Keys still need to be stable; use `byIndex` only
when positional identity is intentional.

## Testing the contract

This repository's Vitest/jsdom test harness can mount this component. Keep the
state update and the row assertion in the same test so a stale closure cannot
pass unnoticed:

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
// Avoid: the For call is skipped while open() is false.
{
  open() ? (
    <For each={items} by={(item) => item.id}>
      {(item) => <Row item={item} />}
    </For>
  ) : null;
}
```

Keep the outer control boundary unconditional and put the conditional branch
inside `<Show>` or `<Match>`:

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
