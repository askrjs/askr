# Migration from React

Askr keeps JSX component composition. The main differences are that state is
read through getter functions, components render once per change instead of
on every parent render, and routing, data loading, and forms are built in.

## Concept map

| React                             | Askr                                                               | Import from                                     |
| --------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------- |
| `useState`                        | `state()`                                                          | `@askrjs/askr`                                  |
| `useMemo`, derived values         | `derive()`; `selector()` for per-row selection                     | `@askrjs/askr`                                  |
| `createContext`, `useContext`     | `defineScope()`, `readScope()`                                     | `@askrjs/askr`                                  |
| `useRef` for DOM nodes            | `ref` prop with a callback or `createRef()`                        | `@askrjs/askr`                                  |
| `useEffect` on mount              | `task()`                                                           | `@askrjs/askr/resources`                        |
| `useEffect` with dependencies     | `watch(source, callback)`                                          | `@askrjs/askr/resources`                        |
| `useEffect` for event listeners   | `on(target, event, handler)`                                       | `@askrjs/askr/resources`                        |
| fetch in `useEffect`              | route `loader` + `routeData()`, or `resource()` in a component     | `@askrjs/askr/router`, `@askrjs/askr/resources` |
| `array.map` with `key`            | `<For each={items} by={(item) => item.id}>` or `key` on elements   | `@askrjs/askr/control`                          |
| `cond && <X />`, ternaries        | `<Show when={cond}>`, `<Case>`/`<Match>`, or plain JSX expressions | `@askrjs/askr/control`                          |
| React Router routes and `<Link>`  | `createRouteRegistry()`, `route()`, `to()`, `<Link>`               | `@askrjs/askr/router`                           |
| data libraries (React Query, SWR) | `createQuery()`, `createMutation()`, `invalidate()`                | `@askrjs/askr/data`                             |
| form libraries and server actions | `defineAction()`, `action()`, `ActionForm`                         | `@askrjs/askr/actions`                          |
| error boundaries                  | `ErrorBoundary`                                                    | `@askrjs/askr/components`                       |

## State and derived values

```ts
// React
const [count, setCount] = useState(0);
console.log(count);

// Askr
const [count, setCount] = state(0);
console.log(count());
```

Calling the getter tracks the read, so only the components and bindings that
read `count()` update when it changes. There is no dependency array: `derive()`
recomputes when the state it read changes, and `watch()` takes the state
accessor itself (`watch(count, ...)`, not `watch(count(), ...)`).

Hooks such as `state()` must run in the same order on every render, as in
React. Askr throws when the number of hook calls, or the kind of hook in a
position, changes between renders, for example when a condition or a loop
count changes. It cannot detect two hooks of the same kind trading places; see
[runtime enforcement](../concepts/runtime-enforcement.md).

## Effects and cleanup

Split `useEffect` by intent:

- Mount-only setup with cleanup is `task()`. Its returned cleanup runs when
  the component unmounts.
- Work that reacts to a value is `watch(source, callback)`. The callback gets
  an `AbortSignal` that aborts when the value changes again or the component
  unmounts.
- Subscriptions to DOM or other event targets are `on()`, which removes the
  listener with the component.

Async work receives a `signal` instead of an "ignore stale result" flag. Pass
it to `fetch()` and other cancellable APIs.

## Context

`defineScope(defaultValue)` returns a scope component. Render it with a
`value` to provide, and call `readScope(Scope)` during render to read the
nearest value:

```tsx
// Askr
const DensityScope = defineScope<'compact' | 'comfortable'>('comfortable');

function Label() {
  return <span>{readScope(DensityScope)}</span>;
}

function App() {
  return (
    <DensityScope value="compact">
      <Label />
    </DensityScope>
  );
}
```

## Refs and keys

An element's `ref` prop receives the element on mount and `null` on removal.
Use a callback or an object from `createRef()`.

Keys work as in React for sibling elements. For lists, prefer `<For>` with a
`by` function: rows keep their identity and state when the list reorders.

## Routes and data

Declare routes once with `createRouteRegistry()` and keep the returned route
references to build typed destinations with `to()`. Pass a destination to
`<Link>`; use a raw `href` only for an intentionally untyped target.

Data a page needs before it renders belongs in a route `loader`, read with
`routeData()`. Wrap only non-critical promises in `defer()` and render them
with `Resolve`. Define form actions with `defineAction()` and render them with
`ActionForm`, so native and enhanced submissions share validation.

## UI packages

Askr's UI components and theming live in separate, optional packages:
`@askrjs/ui` (headless components such as `ToastHost`) and `@askrjs/themes`
(styling and the `ThemeScope` theme provider). The runtime itself has no
component library.

## Next

- [Quick Start](../getting-started/quick-start.md)
- [Routing](../core/routing.md)
- [Data](../core/data.md)
