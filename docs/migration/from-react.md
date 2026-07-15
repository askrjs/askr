# Migration from React

Askr keeps JSX component composition while using explicit getter functions,
lexical scopes, and framework-owned route primitives.

## State and derived values

```ts
// React
const [count, setCount] = useState(0);
console.log(count);

// Askr
const [count, setCount] = state(0);
console.log(count());
```

Prefer functions and closures for stateful services. Use structural interfaces
for dependencies instead of introducing service classes.

## Public vocabulary

Use the clean-break Askr APIs directly:

- `defineScope()` and `readScope()` for lexical runtime scope
- `ThemeScope` and `theme()` for theme ownership and access
- `ToastHost` for the mounted toast region
- `SidebarScope` for sidebar state ownership
- `routeData()` for critical loader data
- `action()` and `ActionForm` for declared page actions
- `Resolve` for an explicit deferred value

Do not add compatibility wrappers for an earlier Askr vocabulary. Server-domain
names such as `ServerContext`, `RouteContext`, `AuthContext`, and
`JwksProvider` remain accurate and are not UI scope conventions.

## Routes and destinations

Declare routes once, retain the returned route reference, and construct typed
destinations with `to()`. Pass that destination to `Link`; use raw `href` only
when the destination is intentionally untyped.

## Data and forms

Critical loader data is read with `routeData()`. Mark only intentionally
deferred promises with `defer()` and render them with `Resolve`.

Define a browser-safe action descriptor beside its schema. Register the server
handler in the composition root, authorize the descriptor on the matched
route, and render `ActionForm` so native and enhanced submissions share the
same validation and protection behavior.

## Next

- [Quick Start](../getting-started/quick-start.md)
- [Routing](../core/routing.md)
- [Data](../core/data.md)
