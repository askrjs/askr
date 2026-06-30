# Askr Platform Documentation

Askr is a **modern application development platform** designed for AI-assisted workflows, strong
conventions, and batteries-included primitives. It provides a cohesive runtime, headless UI
system, optional theming, and official tooling to build complete applications with minimal
external dependencies.

The platform is intentionally modular. The package boundaries are part of the design, and the
shared operating model is documented in [Platform charter](./development/platform-charter.md).

## What Askr is

Askr is a **platform**, not just a framework.

| Package       | Responsibility                     |
| ------------- | ---------------------------------- |
| `askr`        | Core runtime and rendering system  |
| `askr-ui`     | Headless UI primitives             |
| `askr-themes` | Optional styling layer             |
| `askr-lucide` | Lucide icon wrappers for Askr      |
| `askr-cli`    | Project lifecycle and generators   |
| `askr-vite`   | Vite integration for Askr projects |

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

- A backend framework
- A deployment platform
- An authentication provider
- A database layer

## Documentation map

| Section                                                                   | What you will find                                    |
| ------------------------------------------------------------------------- | ----------------------------------------------------- |
| [Getting started](./getting-started/)                                     | Installation, quickstart, platform overview           |
| [Core](./core/)                                                           | Runtime, routing, rendering, data primitives          |
| [UI](https://github.com/askrjs/askr-ui/tree/main/docs/README.md)          | askr-ui docs owned by the package repo                |
| [Styling](https://github.com/askrjs/askr-themes/tree/main/docs/README.md) | askr-themes docs owned by the package repo            |
| [CLI](https://github.com/askrjs/askr-cli/tree/main/docs/README.md)        | askr-cli docs owned by the package repo               |
| [Guides](./guides/)                                                       | Real-app walkthroughs by use case                     |
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
[SSR and SSG pipeline](./internals/ssr-ssg-pipeline.md).

## The most important rule

Every doc reinforces one thing: **there is a canonical way to build an Askr app**.

Not many possible approaches - one recommended approach.
