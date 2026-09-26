# Runtime Enforcement

Askr checks your component structure as it runs.

## Render diagnostics

Development builds warn once per component instance when a render takes more
than 5 ms. Test environments can raise that threshold or suppress warning
output without disabling render timing or component counters:

```ts
import { configureRenderDiagnostics } from '@askrjs/askr';

const restoreDiagnostics = configureRenderDiagnostics({
  slowRenderThresholdMs: 20,
  slowRenderWarnings: false,
});

afterAll(restoreDiagnostics);
```

The returned function restores the previous settings. Production builds keep
diagnostic timing disabled, and the default development behavior is unchanged.

## Component nesting depth

How deep a tree can nest depends on its shape and on the rendering path.

A wrapper chain is a component that returns the next component directly,
without an element in between. On the client, Askr expands wrapper chains
iteratively during mount, reconciliation, and teardown, so they do not depend
on the engine's JavaScript call-stack size. Reconciliation retains each link
and takes time linear in the chain's length.

Everything else recurses once per level. That covers nesting through host
elements, such as `<div><Next /></div>` or plain nested `<div>` elements, on
every path. It also covers server rendering and hydration of wrapper chains.
The engine's call stack bounds these depths.

Askr's Node (jsdom) and Chromium, Firefox, and WebKit test suites guarantee
these depths:

| Tree shape                                  | Mount, update, teardown | Server render, hydration |
| ------------------------------------------- | ----------------------- | ------------------------ |
| Wrapper chain                               | 10,000 components       | 1,000 components         |
| Element nesting, with or without components | 100 elements            | 100 elements             |

Each guaranteed element level may also contain a component, as in
`<div><Next /></div>`. The tests mount through `createIsland`, update both the
deepest component and the root, and tear the island down. The server cases
render through `renderToString`, hydrate with `hydrateSPA`, update, and tear
down.

Beyond these depths, the ceiling is engine-specific. In Node and Chromium,
element-interleaved nesting overflows at roughly 200 to 400 levels depending
on the path, with hydration and updates the lowest. Firefox allows somewhat
more, and WebKit several times more. An overflow can surface as a `RangeError`
or as an unrelated engine error raised while the stack is exhausted. Flatten
generated markup that nests deeper, or split it into multiple render roots.

The renderer retains a separate 100,000-wrapper safety limit for component
output that never terminates. Reaching that limit throws an Askr error with the
recent component chain instead of leaking an engine-specific `RangeError` or
continuing until the process exhausts memory. Split intentionally deeper
generated output into explicit data traversal or multiple render roots.

## Render-scoped hook order

Render-scoped hooks and eager control primitives must be evaluated in the same
order every render. This includes `state()`, `derive()`, lifecycle operations,
`<For>`, and the other primitives that retain render-owned state.

The first completed render records which hook claimed each slot. Every later
render is checked against that sequence in both directions:

- claiming a hook the first render did not claim (an extra hook) throws when
  the hook is called;
- claiming a different kind of hook at a slot (for example `derive()` where the
  first render called `state()`) throws when the hook is called;
- claiming fewer hooks than the first render (a skipped hook) throws when the
  render returns.

### Caught at Runtime

```tsx run=runtime-enforcement-conditional-hook
import { state } from '@askrjs/askr';

function Component() {
  const [expanded, setExpanded] = state(false);

  if (expanded()) {
    state(0); // Error on the render after the click: an extra hook
  }

  return <button onClick={() => setExpanded(true)}>Expand</button>;
}
```

The first render claims one `state()` slot. Clicking the button re-renders the
component with `expanded()` true, so the conditional `state(0)` claims a slot
the first render did not, and that render throws.

The same invariant applies when a plain conditional skips an eager control
primitive:

```tsx
function Component() {
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

The runtime reports that the render-scoped sequence changed and covers both
possible causes: a conditional hook call, or a conditional subtree that skips
its outer control boundary. It recommends keeping the render-scoped call
unconditional and using `<Show>` or `<Case>` with `<Match>` children for
conditional branches.

```tsx
<Show when={open}>
  {() => (
    <For each={items} by={(item) => item.id}>
      {(item) => <Row item={item} />}
    </For>
  )}
</Show>
```

### Why This Matters

Changing the render-scoped sequence breaks retained identity. The runtime can
observe the sequence change, but it cannot infer the exact source construct
that caused it, so the diagnostic describes both supported fixes instead of
blaming component structure.

## Render Mutations

State cannot be mutated during render.

### Caught at Runtime

```tsx run=runtime-enforcement-render-mutation
import { state } from '@askrjs/askr';

function Component() {
  const [x, setX] = state(0);
  setX(1); // Error: mutation during render
  return <div>{x()}</div>;
}
```

**Error message:**

```text
[Askr] state.set() cannot be called during component render. State mutations during render break the actor model and cause infinite loops. Move state updates to event handlers or use conditional rendering instead.
```

Move the update into an event handler, such as
`<button onClick={() => setX(1)}>`.

### Why This Matters

Render mutations cause infinite loops. Askr prevents them before they happen.

## Derived Computation Mutations

`derive()` and `selector()` computations must be pure. They run during render
and again in the scheduler's derived lane, where no component is rendering, so
a write from one could re-trigger the computation in an update loop.

### Caught at Runtime

```typescript
function Component() {
  const [count] = state(0);
  const [, setLast] = state(0);
  const doubled = derive(() => {
    setLast(count()); // Error: write inside a derived computation
    return count() * 2;
  });
  return <div>{doubled()}</div>;
}
```

**Error message:**

```
state.set() cannot be called inside a derive() or selector() computation.
```

The check applies to every recompute, whether it runs during render or in the
derived lane, in development and production builds. A same-value `set()` writes
nothing and is allowed. Move the write to an event handler.
