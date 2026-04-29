# Runtime Enforcement

Askr checks your component structure as it runs.

## Hook Order

State hooks must be called in the same order every render.

### Caught at Runtime

```typescript
function Component() {
  if (condition) {
    const [x, setX] = state(0); // NO Error
  }
}
```

**Error message:**

```
Hook order violation at index 1.

This happens when state() is called conditionally.

Fix: Move all state() calls to the top level:
  const [x, setX] = state(0);
  if (condition) {
    setX(value);
  }
```

### Why This Matters

Conditional hooks break component identity. Askr catches this before it causes bugs.

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
