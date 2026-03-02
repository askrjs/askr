# Common Issues

## `state() can only be called during component render`

Cause: calling `state()` outside a component or conditionally.

Fix: call `state()` at the top level of a component function.

## Hook/state order violations

Cause: calling `state()` inside `if`, loops, or nested functions.

Fix: keep state declarations in stable order on every render.

## `createIsland` with routes

Cause: `createIsland` is for non-routed islands.

Fix: use `createSPA` for routed applications.

## Route not found on startup

Cause: current URL does not match any registered route.

Fix: ensure route registration exists for startup path and pass `getRoutes()` to `createSPA`.

## Async route handlers

Cause: route handlers are expected to return synchronously.

Fix: return a synchronous component and perform async data work with `resource()` + `getSignal()`.

## Next

- [Router Guide](../guides/router.md)
- [Resources Guide](../guides/resources.md)
- [Runtime Enforcement](../concepts/runtime-enforcement.md)
