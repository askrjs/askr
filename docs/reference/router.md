# Router API Reference

Import from `@askrjs/askr/router`.

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

## `Link`

Component for declarative navigation.

## `layout(component)`

Creates layout wrappers for route composition.

## Related

- [Router Guide](../guides/router.md)
- [API Overview](api.md)
