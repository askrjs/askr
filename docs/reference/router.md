# Router API Reference

Import router-specific APIs from `@askrjs/askr/router`.

The root package also re-exports router helpers for compatibility, including advanced registration helpers such as `registerRoute`, `defineRoute`, namespace utilities, and `setServerLocation`.

`createSPA({ root, routes })` is the authoritative boot API for SPA routing. It mounts the current browser path immediately when it matches a provided route. If no route matches yet, the router remains idle until `navigate()` or a `popstate` event resolves one.

## `route()`

Inside a component render, call `route()` with no arguments to read the current route snapshot.

The returned `RouteSnapshot` is read-only and includes:

- `path`
- `params`
- `query`
- `hash`
- `matches`

Use this form to read route params, query string values, and match metadata during render.

## `route(path, handler, namespace?)`

Registers a route handler.

- `path`: route pattern (supports path params like `/users/{id}`)
- `handler`: function receiving params
- `namespace`: optional grouping string

Constraints:

- Register routes before app startup; production startup locks further registration.
- Router APIs are supported in SPA/SSR, not islands.
- Matching prefers more specific paths: literals, then params, then wildcards, then catch-all.

## `getRoutes()`

Returns current route registrations.

Use this with `createSPA({ routes })` when you assemble the route table via `route(...)` registrations.

## `clearRoutes()`

Clears route registrations.

## `navigate(path)`

Triggers client-side navigation.

Use this for route changes after startup. It is not required to activate the initial matching URL because `createSPA()` already mounts the current location when it matches.

## `Link`

Component for declarative navigation.

## `layout(component)`

Creates layout wrappers for route composition.

## Related

- [Router Guide](../guides/router.md)
- [API Overview](api.md)
