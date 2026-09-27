# Common Issues

## `state() can only be called during component render`

Cause: calling `state()` outside a component or conditionally.

Fix: call `state()` at the top level of a component function.

## `Hook order changed` errors

Cause: calling `state()` or another render-scoped hook inside `if`, loops, or
nested functions. Adding, removing, or swapping a hook after the first render
throws `[Askr] Hook order changed in <Component>: slot N ...`.

Fix: call hooks unconditionally at the top level of the component, in the same
order on every render. Control flow such as `<For>`, `<Show>`, and `<Case>` and
child components are not hooks and may be rendered conditionally.

## `createIsland` with routes

Cause: `createIsland` is for non-routed islands.

Fix: use `createSPA` for routed applications.

## Route not found on startup

Cause: current URL does not match any registered route.

Fix: ensure route registration exists for startup path and pass the registry returned by
`createRouteRegistry()` to `createSPA`.

## Async route handlers

Cause: route handlers are expected to return synchronously.

Fix: return a synchronous component and perform async data work with `resource()` + `getSignal()`.

## Next

- [Router Guide](../guides/router.md)
- [Resources Guide](../guides/resources.md)
- [Runtime Enforcement](../concepts/runtime-enforcement.md)
