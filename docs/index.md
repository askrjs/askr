# Askr Platform Docs

Askr is a modern application development platform. Documentation is organized around how people
learn, build, and scale with the platform - not around package boundaries.

-> [Platform README](./README.md) - what Askr is, goals, and documentation map

---

## Getting started

| Page                                                        | Description                             |
| ----------------------------------------------------------- | --------------------------------------- |
| [What is Askr"](./getting-started/what-is-askr.md)          | Short answer: platform, packages, scope |
| [Installation](./getting-started/installation.md)           | Prerequisites, npm install, tsconfig    |
| [Quick start](./getting-started/quick-start.md)             | First running app                       |
| [Platform overview](./getting-started/platform-overview.md) | Layer diagram and responsibilities      |
| [Philosophy](./getting-started/philosophy.md)               | Design principles behind Askr           |

---

## Core

The runtime, routing, rendering, and data primitives.

| Page                             | Description                                                      |
| -------------------------------- | ---------------------------------------------------------------- |
| [Runtime](./core/runtime.md)     | createIsland, createSPA, hydrateSPA, lifecycle                   |
| [Routing](./core/routing.md)     | registerRoutes(), group(), route(), currentRoute(), params, Link |
| [Rendering](./core/rendering.md) | SSR and SSG output                                               |
| [Data](./core/data.md)           | state(), derive(), resource(), context                           |

---

## UI

| Page                                                                               | Description                                     |
| ---------------------------------------------------------------------------------- | ----------------------------------------------- |
| [askr-ui package docs](https://github.com/askrjs/askr-ui/tree/main/docs/README.md) | Canonical askr-ui docs live in the package repo |

---

## Styling

| Page                                                                                       | Description                                         |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| [askr-themes package docs](https://github.com/askrjs/askr-themes/tree/main/docs/README.md) | Canonical askr-themes docs live in the package repo |

---

## CLI

| Page                                                                                 | Description                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| [askr-cli package docs](https://github.com/askrjs/askr-cli/tree/main/docs/README.md) | Canonical askr-cli docs live in the package repo |

---

## Guides

Real app workflows by use case.

| Page                                                     | Description                                  |
| -------------------------------------------------------- | -------------------------------------------- |
| [First app](./guides/first-app.md)                       | Full walkthrough from scratch                |
| [CRUD](./guides/crud.md)                                 | List, detail, create, edit, delete           |
| [Dashboard](./guides/dashboard.md)                       | Shell layout + stat cards + tables           |
| [Forms](./guides/forms.md)                               | Validation, submission, async feedback       |
| [Tables](./guides/tables.md)                             | Filtering, sorting, pagination               |
| [Layouts](./guides/layouts.md)                           | Layout groups, app shell, auth shell         |
| [State](./guides/state.md)                               | state(), derive(), selector() in depth       |
| [Router](./guides/router.md)                             | Router in depth                              |
| [Resources](./guides/resources.md)                       | resource() in depth                          |
| [SSR](./guides/ssr.md)                                   | Server rendering                             |
| [SSR Events](./guides/ssr-events.md)                     | SSR event patterns                           |
| [SSG](./guides/ssg.md)                                   | Static site generation                       |
| [Component generation](./guides/component-generation.md) | Canonical AI/manual component authoring spec |

---

## Reference

| Page                                                  | Description                                    |
| ----------------------------------------------------- | ---------------------------------------------- |
| [Package map](./reference/package-map.md)             | Every package: responsibilities and boundaries |
| [Project structure](./reference/project-structure.md) | Canonical app directory layout                 |
| [Conventions](./reference/conventions.md)             | Naming, component rules, patterns              |
| [Glossary](./reference/glossary.md)                   | Platform terminology                           |
| [API reference](./reference/api.md)                   | Full API by subpath                            |
| [Router reference](./reference/router.md)             | Router API details                             |
| [Resources reference](./reference/resources.md)       | resource() API details                         |
| [FX reference](./reference/fx.md)                     | Timing utilities                               |
| [Spec guarantees](./reference/spec-guarantees.md)     | Behavioral contracts                           |

---

## Concepts

| Page                                                     | Description                      |
| -------------------------------------------------------- | -------------------------------- |
| [Determinism](./concepts/determinism.md)                 | Strict event and update ordering |
| [Runtime enforcement](./concepts/runtime-enforcement.md) | Hook order and structural checks |

---

## Advanced

| Page                                                     | Description                |
| -------------------------------------------------------- | -------------------------- |
| [Event delegation](./advanced/event-delegation.md)       | How delegation works       |
| [Selective hydration](./advanced/selective-hydration.md) | Partial hydration patterns |

---

## Development

| Page                                                        | Description                                |
| ----------------------------------------------------------- | ------------------------------------------ |
| [Platform charter](./development/platform-charter.md)       | Package roles and platform operating model |
| [Repo structure](./development/repo-structure.md)           | Monorepo layout, packages, scripts         |
| [Contributing](./development/contributing.md)               | Setup, build, test, lint                   |
| [Release](./development/release.md)                         | Versioning and publish process             |
| [Platform versioning](./development/platform-versioning.md) | Cross-package platform release contract    |
| [Docs style guide](./contributing/docs-style-guide.md)      | Writing conventions                        |
| [Testing guide](./contributing/testing.md)                  | Test patterns                              |

---

## More

- [Internals: Control-flow primitive design](./internals/for-primitive-design.md)
- [Internals: Foundations pit of success](./internals/foundations-pit-of-success.md)
- [Internals: Foundations audit report](./internals/foundations-audit-report.md)
- [Internals: Router manifest](./internals/router-manifest.md)
- [Benchmarks: Stability](./benchmarks/stability.md)
- [Benchmarks: Performance targets](./benchmarks/performance-targets.md)
- [Migration: From React](./migration/from-react.md)
- [Troubleshooting: Common issues](./troubleshooting/common-issues.md)
- [Roadmap: Navigation promotion](./roadmap/navigation-promotion.md)
