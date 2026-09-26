# Experimental runtime extensions

Import construction-only renderer wiring from `@askrjs/askr/experimental`.
These exports moved from the package root. Existing imports of `createRuntime`,
`getDefaultRuntime`, `AskrRuntime`, `createDOMRendererHost`, and their related
types should use this subpath.
This subpath exposes `createRuntime()`, `getDefaultRuntime()`, `AskrRuntime`,
`createDOMRendererHost()`, and their renderer-host types for runtime and
renderer maintainers.

`createRuntime()` constructs scheduler and renderer wiring. Mounting continues
to use the process default runtime; a new `AskrRuntime` does not isolate a
mounted tree. `createDOMRendererHost(configure)` creates an adapter but does not
install it. The callback must return all five native roles: `evaluation`,
`cleanup`, `scopes`, `keys`, and `reactivity`.

This is an experimental implementation boundary. Application code should use
`@askrjs/askr/boot` to mount and `@askrjs/askr/data` to isolate query state.
See [Runtime extension boundary](../internals/runtime-extension-boundary.md)
for the host ownership rules.
