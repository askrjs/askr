# Askr Platform Docs

This documentation describes the public `@askrjs/askr` package and the related
package boundaries in the platform.

## Getting Started

| Page                                                        | Description                        |
| ----------------------------------------------------------- | ---------------------------------- |
| [What is Askr](./getting-started/what-is-askr.md)           | Platform overview and scope        |
| [Installation](./getting-started/installation.md)           | Prerequisites and install steps    |
| [Quick Start](./getting-started/quick-start.md)             | First running app                  |
| [Platform Overview](./getting-started/platform-overview.md) | Package roles and responsibilities |
| [Philosophy](./getting-started/philosophy.md)               | Design principles                  |

## Core

| Page                             | Description                                                     |
| -------------------------------- | --------------------------------------------------------------- |
| [Runtime](./core/runtime.md)     | `createIsland`, `createSPA`, lifecycle                          |
| [Routing](./core/routing.md)     | `createRouteRegistry`, `group`, `route`, `currentRoute`, `Link` |
| [Rendering](./core/rendering.md) | SSR and SSG output                                              |
| [Data](./core/data.md)           | `state`, `derive`, `resource`, `query`, `mutation`              |

## Package Boundaries

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
| [Behavioral contracts](./reference/spec-guarantees.md) | Runtime behaviors backed by tests          |

## Concepts

| Page                                                     | Description                        |
| -------------------------------------------------------- | ---------------------------------- |
| [Determinism](./concepts/determinism.md)                 | Event ordering and update behavior |
| [Runtime enforcement](./concepts/runtime-enforcement.md) | Hook-order and structural checks   |

## Recipes

| Page                                                      | Description                                      |
| --------------------------------------------------------- | ------------------------------------------------ |
| [Verified platform recipes](./guides/platform-recipes.md) | Routing, browser lifecycle, data, errors, search |

## Development

| Page                                                              | Description                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [Platform charter](./development/platform-charter.md)             | Package roles and operating model                                          |
| [Repo structure](./development/repo-structure.md)                 | Repository layout                                                          |
| [Contributing](./development/contributing.md)                     | Setup, build, test, lint                                                   |
| [Release](./development/release.md)                               | Versioning and publish process                                             |
| [Quality contracts](./development/quality-contracts.md)           | Runtime invariants and test gates                                          |
| [Compatibility boundary](./development/compatibility-boundary.md) | Published contracts and extension adapters                                 |
| [Runtime ownership](./development/ownership.md)                   | Lifetime identity, cancellation, cleanup, and generation preparation       |
| [Runtime source layout](./development/runtime-layout.md)          | Component, lifecycle, reactivity, and transaction implementation groups    |
| [Renderer source layout](./development/renderer-layout.md)        | DOM ownership, component hosts, children, props, and reconciliation groups |
| [Renderer ownership](./development/renderer-ownership.md)         | DOM ranges, host indexes, and platform capabilities                        |
| [Integration boundaries](./development/integration-boundaries.md) | Root transactions, data attachments, and server request isolation          |
| [Platform versioning](./development/platform-versioning.md)       | Release coordination policy                                                |
| [Docs style guide](./contributing/docs-style-guide.md)            | Writing conventions                                                        |
| [Testing guide](./contributing/testing.md)                        | Test patterns                                                              |

## Additional Reading

- [Internals: Core engine design](./internals/core-engine-design.md)
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
