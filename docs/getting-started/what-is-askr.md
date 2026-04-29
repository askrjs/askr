# What is Askr"

Askr is an application development platform for building structured frontends.

It gives you a runtime, a headless UI system, optional theming, icon wrappers, and
tooling - all designed to work together and share conventions.

## One platform, not a collection of libraries

The packages that make up Askr are designed as a cohesive whole:

| Package       | Role                                               |
| ------------- | -------------------------------------------------- |
| `askr`        | Core runtime: rendering, routing, app lifecycle    |
| `askr-ui`     | Headless UI primitives: behavior and accessibility |
| `askr-themes` | Optional visual defaults: tokens and base styles   |
| `askr-lucide` | Lucide icon wrappers built for Askr                |
| `askr-cli`    | Generators and project scaffolding                 |

Each package adds a specific capability. Only `askr` is required. The others are opt-in.

## What kind of apps Askr is for

Askr is particularly well suited to:

- Admin dashboards and internal tools
- CRUD-heavy SaaS applications
- Settings-panel-heavy products
- Structured frontends with consistent layouts

## What Askr is not trying to be

Askr stays focused on frontend application structure. It does not provide:

- A backend or API layer
- Authentication or session management
- Database access
- Deployment infrastructure

## Next steps

- [Quickstart](./quick-start.md) - run your first Askr app
- [Platform overview](./platform-overview.md) - understand how the layers fit together
- [Philosophy](./philosophy.md) - the design principles behind Askr
