# Resources API Reference

Import from `@askrjs/askr/resources`.

## `resource(loader, deps)`

Runs async work with lifecycle awareness and dependency tracking.

- `loader`: async function
- `deps`: dependency list that controls re-execution

## `getSignal()`

Returns the current `AbortSignal` for cancellable async operations.

Use it with platform APIs:

```ts
const res = await fetch('/api/data', { signal: getSignal() });
```

## Related

- [Resources Guide](../guides/resources.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
