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

Askr expands single-child component wrapper chains iteratively during mount and
reconciliation. The supported runtime guardrail mounts 10,000 nested components
through the public `createIsland` boundary in Node and the supported browser
engines, so wrapper-heavy generated UI does not depend on an engine's JavaScript
call-stack size.

The renderer retains a separate 100,000-wrapper safety limit for component
output that never terminates. Reaching that limit throws an Askr error with the
recent component chain instead of leaking an engine-specific `RangeError` or
continuing until the process exhausts memory. Split intentionally deeper
generated output into explicit data traversal or multiple render roots.

## Render-scoped hook order

Render-scoped hooks and eager control primitives must be evaluated in the same
order every render. This includes `state()`, `derive()`, lifecycle operations,
`<For>`, and the other primitives that retain render-owned state.

### Caught at Runtime

```tsx
function Component() {
  const [condition] = state(false);

  if (condition()) {
    state(0);
  }

  return null;
}
```

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

```typescript
function Component() {
  const [x, setX] = state(0);
  setX(1);  // NO Error: mutation during render
  return <div>{x()}</div>;
}
```

**Error message:**

```
state.set() cannot be called during component render.

This causes infinite loops.

Fix: Move state updates to event handlers:
  <button onClick={() => setX(1)}>
```

### Why This Matters

Render mutations cause infinite loops. Askr prevents them before they happen.
