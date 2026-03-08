# Router API Reference

Import from `@askrjs/askr/router`.

`createSPA({ root, routes })` mounts the current browser path immediately when it matches a registered route. If no route matches yet, the router remains idle until `navigate()` or a `popstate` event resolves one.

## `route(path, handler, namespace?)`

Registers a route handler.

- `path`: route pattern (supports path params like `/users/{id}`)
- `handler`: function receiving params
- `namespace`: optional grouping string

## `getRoutes()`

Returns current route registrations.

## `clearRoutes()`

Clears route registrations.

## `navigate(path)`

Triggers client-side navigation.

Use this for route changes after startup. It is not required to activate the initial matching URL.

## `Link`

Component for declarative navigation.

## `layout(component)`

Creates layout wrappers for route composition.

## Related

- [Router Guide](../guides/router.md)
- [API Overview](api.md)
