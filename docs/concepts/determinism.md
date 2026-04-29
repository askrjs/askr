# Deterministic Execution

Askr processes events and state updates in a defined order.

## Event serialization

Events are handled one at a time. One event completes before the next begins.

```ts
function App() {
  const [count, setCount] = state(0);

  return (
    <>
      <button onClick={() => setCount(1)}>Button 1</button>
      <button onClick={() => setCount(2)}>Button 2</button>
    </>
  );
}
```

## Atomic state updates

Multiple state updates in the same handler are applied together in the next render.

```ts
function Component() {
  const [a, setA] = state(0);
  const [b, setB] = state(0);

  return (
    <button
      onClick={() => {
        setA(1);
        setB(2);
      }}
    >
      Update
    </button>
  );
}
```

## Render behavior

If render work throws, the runtime surfaces the error instead of completing the render
path.

## Tests

These behaviors are covered by tests:

- Event ordering
- State batching
- Transaction semantics
