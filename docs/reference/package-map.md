# Package Map

This reference defines the published package boundaries for the Askr platform.
Package-specific details belong to the owning sibling repository.

| Package          | Responsibility                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| `@askrjs/askr`   | Runtime, reactivity, typed routes, actions descriptors, query state, SSR, streaming boundaries, and SSG |
| `@askrjs/schema` | The platform's executable `safeParse()` schema language and deterministic OpenAPI projection            |
| `@askrjs/auth`   | Structural principal/claim contracts, authentication resolution, and route policy composition           |
| `@askrjs/server` | Request contexts, API operations, page action handlers, CSRF, rate limiting, probes, and middleware     |
| `@askrjs/node`   | Node HTTP transport with Web-stream backpressure, repeated headers, and cancellation                    |
| `@askrjs/vite`   | Askr JSX integration and Vite-owned document composition                                                |
| `@askrjs/i18n`   | Typed, application-owned catalogs, locale scopes, and hydration snapshots                               |
| `@askrjs/otel`   | Optional-peer OpenTelemetry spans and redaction-safe structured logging                                 |
| `@askrjs/ui`     | Headless, accessible interaction components                                                             |
| `@askrjs/themes` | Optional theme scopes, styled components, tokens, and templates                                         |
| `@askrjs/lucide` | Tree-shakeable Askr-native Lucide icon wrappers                                                         |
| `@askrjs/charts` | Askr-native chart components                                                                            |
| `@askrjs/monaco` | Askr-native Monaco editor integration                                                                   |
| `@askrjs/cli`    | Project creation, action generation, OpenAPI drift checks, skills, and SSG commands                     |

## Import guidance

Prefer the package and subpath that owns the feature.

```ts
import { defineScope, readScope, state } from '@askrjs/askr';
import { ActionForm, action, defineAction } from '@askrjs/askr/actions';
import { createSPA } from '@askrjs/askr/boot';
import { createQuery } from '@askrjs/askr/data';
import {
  defer,
  Link,
  Resolve,
  route,
  routeData,
  to,
} from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';
import { createStaticGen } from '@askrjs/askr/ssg';
```

Import `schema`, `createI18n`, and `createTelemetry` from their owning sibling
packages when those packages are installed.

Action descriptors and schemas may enter the browser graph. Registered action
handlers, secrets, stores, and server dependencies may not.

## Deliberate boundaries

- Vite owns the document; server packages return app responses and metadata.
- Executable schemas are the only declared validation contract. `ctx.bind()` is
  available only when an application intentionally accepts unvalidated input.
- i18n locale selection and telemetry exporters stay application-owned.
- Databases, ORMs, identity providers, developer tools, vendor deployment
  adapters, WebSockets, and proprietary telemetry backends stay outside the
  platform.
