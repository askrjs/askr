# Platform Overview

Askr is a set of independently published packages with one composition model.
Applications take only the layers they need; the full-stack stage combines the
same route graph across browser navigation, SSR, page actions, APIs, and SSG.

## Platform layers

```text
Application and composition root
  @askrjs/cli                         project creation and generators
  @askrjs/node + @askrjs/vite         production transport and document owner
  @askrjs/server + @askrjs/auth       APIs, page actions, policies, protection
  @askrjs/schema                      executable input and OpenAPI contracts
  @askrjs/i18n + @askrjs/otel         application-owned locale and telemetry
  @askrjs/themes + ui packages        optional visual and interaction layers
  @askrjs/askr                        runtime, routes, data, SSR, and SSG
```

`@askrjs/askr` is the only required runtime package. Server, transport,
localization, telemetry, and UI packages remain explicit application choices.

## Core application model

- `route()` returns a typed route reference. `to()` constructs and validates a
  destination before `Link` renders it.
- `routeData()` reads critical loader data. Explicit `defer()` values render
  through `Resolve` and can stream after the document shell.
- `defineAction()` creates a browser-safe descriptor. A matched route must
  authorize it, while the server composition root registers its handler once.
- `defineScope()` and `readScope()` provide lexical ownership without a global
  singleton or React-shaped hook vocabulary.
- Functions, closures, and structural interfaces are preferred over classes.

## Server and document ownership

`@askrjs/server` owns request handling, executable API operations, action
authorization, CSRF, policies, and rate limiting. `ctx.bind()` remains the
explicit escape hatch for unvalidated server input; declared operations read
and validate params, query, headers, and body separately.

Vite is the sole HTML document owner. An application template contains exactly
one `<!--askr-head-->` marker and one `<!--askr-app-->` marker. Askr injects only
its owned metadata and streamed app output, preserving all other static head
content.

## Application-owned services

`createI18n(sourceLocale, catalogs)` returns a typed locale service whose `Scope` establishes
locale and direction. Applications still decide whether locale comes from a
path prefix, host, cookie, or user profile.

`createTelemetry()` connects framework spans to an application-installed
OpenTelemetry provider. It installs no SDK, exporter, backend, or processor and
accepts only redaction-safe structured fields.

## Intentional exclusions

Askr does not own developer tools, databases or ORMs, identity providers,
vendor deployment adapters, WebSockets, or proprietary telemetry backends.

## Next steps

- [Installation](./installation.md)
- [Quick start](./quick-start.md)
- [Package map](../reference/package-map.md)
- [CLI overview](https://github.com/askrjs/askr-cli/tree/main/docs/overview.md)
