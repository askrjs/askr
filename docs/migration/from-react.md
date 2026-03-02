# Migration from React

Askr and React both use component composition, but state reading differs.

## Key mental model shift

- React: read state as values.
- Askr: read state by calling getter functions.

```ts
// React
const [count, setCount] = useState(0);
console.log(count);

// Askr
const [count, setCount] = state(0);
console.log(count());
```

## Practical migration steps

1. Replace `useState` with `state`.
2. Update state reads to getter calls (`value()` instead of `value`).
3. Keep updates in handlers and async workflows.
4. Move router-specific logic to `@askrjs/askr/router` where needed.

## Next

- [Quick Start](../getting-started/quick-start.md)
- [State Guide](../guides/state.md)
