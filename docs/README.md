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

| Section                                                                   | What you will find                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Getting started](./getting-started/)                                     | Installation, quickstart, platform overview           |
| [Core](./core/)                                                           | Runtime, routing, rendering, data primitives          |
| [UI](https://github.com/askrjs/askr-ui/tree/main/docs/README.md)          | askr-ui docs owned by the package repo                |
| [Styling](https://github.com/askrjs/askr-themes/tree/main/docs/README.md) | askr-themes docs owned by the package repo            |
| [CLI](https://github.com/askrjs/askr-cli/tree/main/docs/README.md)        | askr-cli docs owned by the package repo               |
| [Guides](./guides/)                                                       | Real-app walkthroughs by use case                     |
| [Platform recipes](./guides/platform-recipes.md)                          | Verified routing, data, lifecycle, and error patterns |
| [Reference](./reference/)                                                 | Package map, project structure, conventions, glossary |
| [Development](./development/)                                             | Platform charter, monorepo layout, release process    |

Benchmark workflow and current optimization goals live under
[Benchmarks](./benchmarks/), including the
[benchmark index](./benchmarks/README.md), the
[stability workflow](./benchmarks/stability.md), and
[performance targets](./benchmarks/performance-targets.md).

For contributors who need the runtime shape rather than API-first docs, see
[Internals: Core engine design](./internals/core-engine-design.md).
The detailed drill-downs live in
[Runtime reactivity](./internals/runtime-reactivity.md),
[Renderer pipeline](./internals/renderer-pipeline.md), and
[SSR and SSG pipeline](./internals/ssr-ssg-pipeline.md), with the route split
covered in [Router internals](./internals/router-manifest.md).

## The most important rule

Every doc reinforces one thing: **there is a canonical way to build an Askr app**.

Not many possible approaches - one recommended approach.
