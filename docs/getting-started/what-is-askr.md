# What is Askr

Askr is a TypeScript UI runtime with getter-based state, tracked component
renders and DOM bindings, transactional commits, and a shared route graph for
browser and server rendering. Its platform packages add optional capabilities.

The core package owns rendering, reactivity, routing, data helpers, SSR, and
SSG. Independently published packages add HTTP services, authentication,
schemas, database access, UI, and tooling when an application needs them.

## Package boundaries

`@askrjs/askr` is the only required runtime package. Applications choose
sibling packages explicitly:

- `@askrjs/server` and `@askrjs/node` add HTTP application and transport
  layers. `@askrjs/auth` and `@askrjs/schema` provide contracts that core
  routes and actions can use.
- `@askrjs/orm` offers optional database access. `@askrjs/fetch` offers typed
  HTTP contracts and clients.
- `@askrjs/ui`, `@askrjs/themes`, and the other visual packages add optional
  components and assets.

See the [package map](../reference/package-map.md) for the complete list and
import boundaries.

## What kind of apps Askr is for

Askr is particularly well suited to:

- Admin dashboards and internal tools
- CRUD-heavy SaaS applications
- Settings-panel-heavy products
- Structured frontends with consistent layouts

## Application choices

Askr packages provide HTTP, auth, and database integration points, while the
application chooses its identity provider, database deployment, and hosting
environment. The core runtime does not open a database connection or run an
HTTP server by itself.

The [platform overview](./platform-overview.md) shows how the optional layers
compose around one route graph.

## Next steps

- [Quickstart](./quick-start.md) - run your first Askr app
- [Platform overview](./platform-overview.md) - understand how the layers fit together
- [Philosophy](./philosophy.md) - the design principles behind Askr
