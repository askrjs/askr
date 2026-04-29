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
  const [x, setX] = state(0); // NO Hook order violation
}

// Error shows the fix:
const [x, setX] = state(0);
if (condition) {
  setX(newValue); // OK Correct
}
```

### Deterministic Execution

Events serialize through a scheduler. State updates are atomic. Renders follow strict ordering.

```typescript
// Event 1 completes (handler + state + DOM)
// Then Event 2 starts
// No race conditions
```

Proven with 524 tests covering:

- Event ordering (12 tests)
- State atomicity (12 tests)
- Transaction semantics (30 tests)

### Automatic Cleanup

Every component gets an AbortSignal for automatic cancellation.

```typescript
import { resource } from '@askrjs/askr/resources';

function Data({ id }) {
  const data = resource(async ({ signal }) => {
    const res = await fetch(`/api/${id}`, { signal });
    return res.json();
  }, [id]);

  if (data.pending || !data.value) return <div>Loading...</div>;
  if (data.error) return <div>Failed to load</div>;
  return <div>{data.value.name}</div>;
}
// Async work is cancelled automatically on unmount/navigation
```

### Explicit Reactivity

Getters and setters are functions. Call the getter to read and the setter to update - this makes reactivity explicit in your code.

```typescript
const [count, setCount] = state(0);
console.log(count()); // getter: read
setCount(1); // setter: write
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
import { derive, state } from '@askrjs/askr';

function Counter() {
  const [count, setCount] = state(0);
  const doubled = derive(() => count() * 2);

  return (
    <button onClick={() => setCount((prev) => prev + 1)}>
      {count()} -> {doubled()}
    </button>
  );
}
```

`derive()` now returns a getter. Migrate `const doubled = derive(...); {doubled}` to `const doubled = derive(...); {doubled()}`.

### Keyed Selectors

```typescript
function Table({ rows }) {
  const [selectedId, setSelectedId] = state<number | null>(null);
  const isSelected = selector(selectedId);

  return For(
    () => rows(),
    (row) => row.id,
    (row) => (
      <tr class={() => (isSelected(row.id) " 'danger' : '')}>
        <td>
          <a onClick={() => setSelectedId(row.id)}>{row.id}</a>
        </td>
      </tr>
    )
  );
}
```

Use `selector()` for row selection, active-route checks, and similar keyed fanout hotspots. Create it once in the owner component and reuse the keyed predicate across rows.

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
import { createSPA } from '@askrjs/askr';
import { getRoutes, route } from '@askrjs/askr/router';

// Single component
createIsland({
  root: document.body,
  component: MyComponent,
});

// Routed app
route('/', () => <Home />);
route('/about', () => <About />);

createSPA({
  root: document.body,
  routes: getRoutes(),
});
```

`createSPA({ routes })` is the authoritative boot API. `route(...)` plus `getRoutes()` is the convenience way to assemble that route table. Prefer `@askrjs/askr/router` for router-focused imports; the root barrel also re-exports router helpers for compatibility.

---

## Documentation

- [Documentation Index](docs/index.md)
- [Install](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [State Management](docs/guides/state.md)
- [Router Guide](docs/guides/router.md)
- [Resources Guide](docs/guides/resources.md)
- [SSG Guide (Advanced)](docs/guides/ssg.md)
- [Runtime Enforcement](docs/concepts/runtime-enforcement.md)
- [Deterministic Execution](docs/concepts/determinism.md)
- [API Reference](docs/reference/api.md)

---

## Guarantees

Askr provides provable guarantees, tested with 524 tests:

- Hook order enforcement (12 tests)
- Event serialization (12 tests)
- Atomic transactions (30 tests)
- Keyed reconciliation (12 tests)
- Memory safety (8 tests)

[See test suite ->](tests/README.md)

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
