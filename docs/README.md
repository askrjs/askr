# Askr Platform Documentation

Askr is a **modern application development platform** designed for AI-assisted workflows, strong
conventions, and batteries-included primitives. It provides a cohesive runtime, headless UI
system, optional theming, and official tooling to build complete applications with minimal
external dependencies.

## What Askr is

Askr is a **platform**, not just a framework.

| Package       | Responsibility                    |
| ------------- | --------------------------------- |
| `askr`        | Core runtime and rendering system |
| `askr-ui`     | Headless UI primitives            |
| `askr-themes` | Optional styling layer            |
| `askr-lucide` | Lucide icon wrappers for Askr     |
| `askr-cli`    | Project lifecycle and generators  |

Every package is optional except `askr`. You add the others as your application needs them.

## Platform goals

Askr prioritizes:

- **Predictable structure** — consistent project layout that scales
- **AI-friendly conventions** — standard patterns improve reliability of AI-assisted development
- **Minimal configuration** — strong defaults reduce decision fatigue
- **Practical primitives** — common application needs work without external libraries
- **Fast iteration** — generators and scaffolding keep the feedback loop tight

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

| Section                               | What you will find                                    |
| ------------------------------------- | ----------------------------------------------------- |
| [Getting started](./getting-started/) | Installation, quickstart, platform overview           |
| [Core](./core/)                       | Runtime, routing, rendering, data primitives          |
| [UI](./ui/)                           | askr-ui headless primitives and composition patterns  |
| [Styling](./styling/)                 | askr-themes, tokens, theming                          |
| [CLI](./cli/)                         | Project creation, generators, workflows               |
| [Guides](./guides/)                   | Real-app walkthroughs by use case                     |
| [Reference](./reference/)             | Package map, project structure, conventions, glossary |
| [Development](./development/)         | Monorepo layout, contributing, release process        |

## The most important rule

Every doc reinforces one thing: **there is a canonical way to build an Askr app**.

Not many possible approaches — one recommended approach.
