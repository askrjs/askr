# Askr Platform Documentation

Askr is a **modern application development platform** designed for AI-assisted workflows, strong
conventions, and batteries-included primitives. It provides a cohesive runtime, headless UI
system, optional theming, and official tooling to build complete applications with minimal
external dependencies.

The platform is intentionally modular. The package boundaries are part of the design, and the
shared operating model is documented in [Platform charter](./development/platform-charter.md).

## What Askr is

Askr is a **platform**, not just a framework.

| Package                     | Responsibility                                     |
| --------------------------- | -------------------------------------------------- |
| `askr`                      | Runtime, typed routes, actions, data, SSR, and SSG |
| `askr-schema`               | Executable validation and OpenAPI schemas          |
| `askr-auth` / `askr-server` | Auth contracts, APIs, actions, and protection      |
| `askr-node` / `askr-vite`   | Production transport and document composition      |
| `askr-i18n` / `askr-otel`   | Application-owned locale and telemetry services    |
| `askr-ui` / `askr-themes`   | Headless interaction and optional styling          |
| `askr-cli`                  | Project lifecycle and generators                   |

Every package is optional except `askr`. You add the others as your application needs them.

## Platform goals

Askr prioritizes:

- **Predictable structure** - consistent project layout that scales
- **AI-friendly conventions** - standard patterns improve reliability of AI-assisted development
- **Minimal configuration** - strong defaults reduce decision fatigue
- **Practical primitives** - common application needs work without external libraries
- **Fast iteration** - generators and scaffolding keep the feedback loop tight

## What Askr is optimized for

Askr is designed to make these application types straightforward:

- SaaS admin interfaces
- CRUD applications
- Dashboards
- Settings panels
- Internal tools
- Structured frontends

## What Askr is not

Askr focuses on frontend application structure and developer workflow. It is not:

- A developer-tools suite
- A database or ORM
- An identity provider
- A vendor deployment platform
- A WebSocket stack
- A proprietary telemetry backend

## Documentation map

Package documentation owned by sibling repositories:
[askr-ui](https://github.com/askrjs/askr-ui/tree/main/docs/README.md),
[askr-themes](https://github.com/askrjs/askr-themes/tree/main/docs/README.md),
and [askr-cli](https://github.com/askrjs/askr-cli/tree/main/docs/README.md).
Guides live in [guides](./guides/), and benchmark workflow in
[benchmarks](./benchmarks/README.md).

### Getting Started

| Page                                                        | Description                        |
| ----------------------------------------------------------- | ---------------------------------- |
| [What is Askr](./getting-started/what-is-askr.md)           | Platform overview and scope        |
| [Installation](./getting-started/installation.md)           | Prerequisites and install steps    |
| [Quick Start](./getting-started/quick-start.md)             | First running app                  |
| [Platform Overview](./getting-started/platform-overview.md) | Package roles and responsibilities |
| [Philosophy](./getting-started/philosophy.md)               | Design principles                  |

### Core

| Page                             | Description                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| [Runtime](./core/runtime.md)     | `createIsland`, `createSPA`, lifecycle                          |
| [Routing](./core/routing.md)     | `createRouteRegistry`, `group`, `route`, `currentRoute`, `Link` |
| [Rendering](./core/rendering.md) | SSR and SSG output                                              |
| [Data](./core/data.md)           | `state`, `derive`, `resource`, `query`, `mutation`              |

### Package Boundaries

| Page                                                   | Description                                |
| ------------------------------------------------------ | ------------------------------------------ |
| [Package map](./reference/package-map.md)              | Public packages and their responsibilities |
| [Project structure](./reference/project-structure.md)  | Application layout                         |
| [Conventions](./reference/conventions.md)              | Naming and composition rules               |
| [Glossary](./reference/glossary.md)                    | Platform terminology                       |
| [API reference](./reference/api.md)                    | Entry points and examples                  |
| [Router reference](./reference/router.md)              | Router API details                         |
| [Resources reference](./reference/resources.md)        | Resource API details                       |
| [FX reference](./reference/fx.md)                      | Timing utilities                           |
| [Foundations reference](./reference/foundations.md)    | Low-level UI building blocks               |
| [Behavioral contracts](./reference/spec-guarantees.md) | Runtime behaviors backed by tests          |

### Concepts

| Page                                                     | Description                        |
| -------------------------------------------------------- | ---------------------------------- |
| [Determinism](./concepts/determinism.md)                 | Event ordering and update behavior |
| [Runtime enforcement](./concepts/runtime-enforcement.md) | Hook-order and structural checks   |

### Recipes

| Page                                                      | Description                                      |
| --------------------------------------------------------- | ------------------------------------------------ |
| [Verified platform recipes](./guides/platform-recipes.md) | Routing, browser lifecycle, data, errors, search |

### Development

| Page                                                                          | Description                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [Platform charter](./development/platform-charter.md)                         | Package roles and operating model                                 |
| [Repo structure](./development/repo-structure.md)                             | Repository layout                                                 |
| [Contributing](../CONTRIBUTING.md)                                            | Setup, build, test, lint                                          |
| [Release](./development/release.md)                                           | Versioning and publish process                                    |
| [0.4.0 core rewrite migration map](./development/0.4.0-core-rewrite-readiness.md) | Historical cross-package migration snapshot                       |
| [Quality contracts](./development/quality-contracts.md)                       | Runtime invariants and test gates                                 |
| [Compatibility boundary](./development/compatibility-boundary.md)             | Published contracts and consumer validation                       |
| [Core source layout](./development/core-layout.md)                            | Core layers and DOM renderer modules                              |
| [Integration boundaries](./development/integration-boundaries.md)             | Root transactions, data attachments, and server request isolation |
| [Platform versioning](./development/platform-versioning.md)                   | Release coordination policy                                       |
| [Docs style guide](./contributing/docs-style-guide.md)                        | Writing conventions                                               |
| [Testing guide](./contributing/testing.md)                                    | Test patterns                                                     |

### Additional Reading

- [Internals: Core rewrite](./internals/core-rewrite.md)
- [Internals: Runtime reactivity](./internals/runtime-reactivity.md)
- [Internals: Renderer pipeline](./internals/renderer-pipeline.md)
- [Internals: SSR and SSG pipeline](./internals/ssr-ssg-pipeline.md)
- [Internals: Control-flow primitive design](./internals/for-primitive-design.md)
- [Internals: Foundations pit of success](./internals/foundations-pit-of-success.md)
- [Internals: Router manifest](./internals/router-manifest.md)
- [Benchmarks: Stability](./benchmarks/stability.md)
- [Benchmarks: Performance targets](./benchmarks/performance-targets.md)
- [Migration: From React](./migration/from-react.md)
- [Troubleshooting: Common issues](./troubleshooting/common-issues.md)

## The most important rule

Every doc reinforces one thing: **there is a canonical way to build an Askr app**.

Not many possible approaches - one recommended approach.
