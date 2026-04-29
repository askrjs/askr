# Askr Platform Docs

This documentation describes the public `@askrjs/askr` package and the related
package boundaries in the platform.

## Getting Started

| Page | Description |
| --- | --- |
| [What is Askr](./getting-started/what-is-askr.md) | Platform overview and scope |
| [Installation](./getting-started/installation.md) | Prerequisites and install steps |
| [Quick Start](./getting-started/quick-start.md) | First running app |
| [Platform Overview](./getting-started/platform-overview.md) | Package roles and responsibilities |
| [Philosophy](./getting-started/philosophy.md) | Design principles |

## Core

| Page | Description |
| --- | --- |
| [Runtime](./core/runtime.md) | `createIsland`, `createSPA`, lifecycle |
| [Routing](./core/routing.md) | `registerRoutes`, `group`, `route`, `currentRoute`, `Link` |
| [Rendering](./core/rendering.md) | SSR and SSG output |
| [Data](./core/data.md) | `state`, `derive`, `resource`, `context` |

## Package Boundaries

| Page | Description |
| --- | --- |
| [Package map](./reference/package-map.md) | Public packages and their responsibilities |
| [Project structure](./reference/project-structure.md) | Application layout |
| [Conventions](./reference/conventions.md) | Naming and composition rules |
| [Glossary](./reference/glossary.md) | Platform terminology |
| [API reference](./reference/api.md) | Entry points and examples |
| [Router reference](./reference/router.md) | Router API details |
| [Resources reference](./reference/resources.md) | Resource API details |
| [FX reference](./reference/fx.md) | Timing utilities |
| [Behavioral contracts](./reference/spec-guarantees.md) | Runtime behaviors backed by tests |

## Concepts

| Page | Description |
| --- | --- |
| [Determinism](./concepts/determinism.md) | Event ordering and update behavior |
| [Runtime enforcement](./concepts/runtime-enforcement.md) | Hook-order and structural checks |

## Development

| Page | Description |
| --- | --- |
| [Platform charter](./development/platform-charter.md) | Package roles and operating model |
| [Repo structure](./development/repo-structure.md) | Repository layout |
| [Contributing](./development/contributing.md) | Setup, build, test, lint |
| [Release](./development/release.md) | Versioning and publish process |
| [Platform versioning](./development/platform-versioning.md) | Release coordination policy |
| [Docs style guide](./contributing/docs-style-guide.md) | Writing conventions |
| [Testing guide](./contributing/testing.md) | Test patterns |

## Additional Reading

- [Internals: Control-flow primitive design](./internals/for-primitive-design.md)
- [Internals: Foundations pit of success](./internals/foundations-pit-of-success.md)
- [Internals: Foundations audit report](./internals/foundations-audit-report.md)
- [Internals: Router manifest](./internals/router-manifest.md)
- [Benchmarks: Stability](./benchmarks/stability.md)
- [Benchmarks: Performance targets](./benchmarks/performance-targets.md)
- [Migration: From React](./migration/from-react.md)
- [Troubleshooting: Common issues](./troubleshooting/common-issues.md)
- [Roadmap: Navigation promotion](./roadmap/navigation-promotion.md)
