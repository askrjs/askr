# Deterministic Execution

Askr guarantees strict ordering of events and state updates.

## Event Serialization

Events are processed one at a time. An event fully completes before the next starts.

```typescript
function App() {
  const [count, setCount] = state(0);

  return (
    <>
      <button onClick={() => setCount(1)}>Button 1</button>
      <button onClick={() => setCount(2)}>Button 2</button>
    </>
  );
}

// Timeline:
// Click 1 -> handler runs -> state updates -> DOM commits
// THEN Click 2 -> handler runs -> state updates -> DOM commits
```

No race conditions. Guaranteed order.

## Atomic State Updates

State updates are batched and applied atomically.

```typescript
function Component() {
  const [a, setA] = state(0);
  const [b, setB] = state(0);

  <button onClick={() => {
    setA(1);
    setB(2);
  }}>

  // Both updates happen in one render
  // DOM commits once
}
```

## Transactional Renders

Renders either complete fully or roll back.

```typescript
function Component() {
  const data = riskyOperation();  // Might throw
  return <div>{data}</div>;
}

// If riskyOperation() throws:
// - No partial DOM
// - Previous state unchanged
// - Error boundary catches it
```

All-or-nothing semantics.

## Tests

These guarantees are proven with tests:

- Event ordering: 12 tests
- State batching: 12 tests
- Transaction semantics: 30 tests

[See test suite ->](../tests/README.md)
