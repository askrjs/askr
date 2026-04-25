# Glossary

Platform terms used consistently across Askr documentation and tooling.

---

**Platform**

The full Askr system: runtime, UI primitives, theming, icon wrappers, and CLI working together.
"Askr is a platform" means these packages share conventions and are designed as a cohesive
whole, not as independent libraries assembled ad hoc.

---

**Runtime**

The `@askrjs/askr` package. Handles rendering, routing, reactivity, and application lifecycle.

---

**Island**

A single mounted Askr component tree. Created with `createIsland()`. Used when you want to
add interactivity to a specific part of a page without a full SPA.

---

**SPA**

Single-Page Application mode. Created with `createSPA()`. A full client-rendered app with the
Askr router managing all navigation.

---

**SSR**

Server-Side Rendering. The runtime renders components to an HTML string on the server.
The client hydrates the result with `hydrateSPA()`.

---

**SSG**

Static Site Generation. Routes are pre-rendered to `.html` files at build time using
`createStaticGen()` or the `askr-cli ssg` command.

---

**Route**

A mapping from a URL path to a component. Defined with `route(path, Component)`. Routes
can be grouped under `registerRoutes()` and `group()` scopes.

---

**Layout**

A component that wraps one or more routes, providing shared UI structure (navigation,
headers, sidebars). Applied with `group({ layout: Component }, fn)`.

---

**Page**

A component registered as a route. Pages receive route parameters and are responsible
for the top-level structure of a given URL.

---

**Headless UI**

UI primitives that provide interaction behavior and accessibility without imposing visual
styling. `@askrjs/askr-ui` is headless. Pair it with `askr-themes` or your own CSS.

---

**Foundation**

A low-level primitive used to build framework structure or headless UI behavior. Structural
foundations live in `@askrjs/askr/foundations`; behavior foundations used by `askr-ui`
live in `@askrjs/askr-ui/foundations`.

---

**Primitive**

A composable building block. In the Askr context, a primitive is the smallest meaningful
unit of behavior or rendering — a button, a dialog, a state getter.

---

**Theme**

The visual layer provided by `@askrjs/askr-themes`. Includes design tokens and base
component styles. Themes are optional and replaceable.

---

**Generator**

A CLI command that scaffolds code. For example, `askr-cli create` generates a full project.
Planned generators include `askr-cli add page` and `askr-cli add crud`.

---

**Resource**

An async data primitive created with `resource()`. Handles loading state, cancellation via
`AbortSignal`, and error state automatically.

---

**Derive**

A computed value created with `derive()`. Re-evaluates when its upstream `state` dependencies
change. Returns a getter function like `state()`.

---

**Selector**

A keyed membership predicate created with `selector()`. Efficient for cases where many items
need to know if they are the "selected" item.

---

**Token**

A named design variable (e.g., `--color-brand`, `--spacing-md`). Defined in `askr-themes`
or overridden per-application in `tokens.css`.

---

## See also

- [Package map](./package-map.md)
- [Conventions](./conventions.md)
- [API reference](./api.md)
