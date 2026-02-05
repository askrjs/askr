# Askr

Deterministic UI runtime with runtime enforcement.

## Quick Start

```typescript
import { createIsland, state } from '@askrjs/askr';

function Counter() {
  const [count, setCount] = state(0);
  return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
}

createIsland({ root: document.body, component: Counter });
```

---

## Core Features

### Runtime Enforcement

Askr validates component structure as it runs, catching mistakes with clear error messages.

```typescript
// This error is caught immediately:
if (condition) {
  const [x, setX] = state(0); // ❌ Hook order violation
}

// Error shows the fix:
const [x, setX] = state(0);
if (condition) {
  setX(newValue); // ✅ Correct
}
```

### Deterministic Execution

Events serialize through a scheduler. State updates are atomic. Renders follow strict ordering.

```typescript
// Event 1 completes (handler + state + DOM)
// Then Event 2 starts
// No race conditions
```

Proven with 133 tests covering:

- Event ordering (12 tests)
- State atomicity (12 tests)
- Transaction semantics (30 tests)

### Automatic Cleanup

Every component gets an AbortSignal for automatic cancellation.

```typescript
async function Data({ id }) {
  const signal = getSignal();
  const data = await fetch(`/api/${id}`, { signal });
  return <div>{data}</div>;
}
// Fetch cancelled automatically on unmount
```

### Explicit Reactivity

Reactive values are functions. Calls are visible in code.

```typescript
const [count, setCount] = state(0);
console.log(count()); // Read
setCount(1); // Write
```

Clear data flow. No hidden subscriptions.

---

## API

### State

```typescript
const [value, setValue] = state(initialValue);

// Read
value();

// Write
setValue(newValue);

// Update
setValue((prev) => prev + 1);
```

### Derived State

```typescript
const [count, setCount] = state(0);
const doubled = derive(() => count() * 2);

console.log(doubled()); // Automatically updates
```

### Lists

```typescript
const [items, setItems] = state([...]);

For(
  items,
  (item) => item.id,
  (item) => <Item {...item} />
)
```

### Apps

```typescript
// Single component
createIsland({
  root: document.body,
  component: MyComponent,
});

// Routed app
createSPA({
  root: document.body,
  component: Layout,
  routes: [
    { path: '/', component: Home },
    { path: '/about', component: About },
  ],
});
```

---

## Documentation

- [Getting Started](docs/getting-started.md)
- [State Management](docs/state.md)
- [Runtime Enforcement](docs/enforcement.md)
- [Deterministic Execution](docs/determinism.md)
- [API Reference](docs/api.md)

---

## Guarantees

Askr provides provable guarantees, tested with 133 tests:

- Hook order enforcement (12 tests)
- Event serialization (12 tests)
- Atomic transactions (30 tests)
- Keyed reconciliation (12 tests)
- Memory safety (8 tests)

[See test suite →](tests/README.md)

---

## Migration

### Coming from React

| React                           | Askr                         |
| ------------------------------- | ---------------------------- |
| `const [x, setX] = useState(0)` | `const [x, setX] = state(0)` |
| `x`                             | `x()`                        |
| `setX(1)`                       | `setX(1)`                    |

The main difference: values are functions that you call to read.

---

## Install

```bash
npm install @askrjs/askr
```

## License

Apache 2.0
