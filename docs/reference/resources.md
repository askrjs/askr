# Resources API Reference

Import from `@askrjs/askr/resources`.

Query and mutation helpers live in `@askrjs/askr/data`.

## Resource helpers

The resources subpath owns `resource()`, `on()`, `timer()`, `task()`, `stream()`,
`capture()`, and `getSignal()`.

### `resource(loader, deps)`

Runs async work with lifecycle awareness and dependency tracking.

- `loader`: function receiving `{ signal }` and returning either a value or a promise
- `deps`: dependency list that controls re-execution

Returns an object with:

- `value`
- `pending`
- `error`
- `refresh()`

Example:

```ts
const user = resource(async ({ signal }) => {
  const res = await fetch('/api/user', { signal });
  return res.json();
}, []);

if (user.pending || !user.value) return 'loading';
if (user.error) return 'failed';
return user.value.name;
```

### `getSignal()`

Returns the current `AbortSignal` for cancellable async operations.

This is most useful during component render or when you need access to the
component-owned signal outside a `resource()` loader. For resource loaders,
prefer the `{ signal }` argument passed into the loader itself.

Use it with platform APIs:

```ts
const res = await fetch('/api/data', { signal: getSignal() });
```

### Other helpers

- `on`
- `timer`
- `task`
- `stream`
- `capture`

Use this entrypoint when your module is primarily about async work, side
effects, or lifecycle-aware operations.

## Related

- [Resources Guide](../guides/resources.md)
- [Data API Reference](./data.md)
- [Troubleshooting](../troubleshooting/common-issues.md)
