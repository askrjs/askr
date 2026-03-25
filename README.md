# Askr Monorepo

Askr is a modern application development platform focused on strong conventions,
AI-assisted workflows, and practical primitives.

This monorepo contains the official platform packages, docs, and release automation.

## Packages

The platform is deliberately split into product packages and supporting tooling packages. The
shared operating model is documented in [docs/development/platform-charter.md](docs/development/platform-charter.md).

### Product packages

| Package               | Purpose                                              |
| --------------------- | ---------------------------------------------------- |
| `@askrjs/askr`        | Core runtime: rendering, routing, lifecycle, SSR/SSG |
| `@askrjs/askr-ui`     | Headless UI primitives and accessibility behavior    |
| `@askrjs/askr-themes` | Optional styling layer (tokens and base theme)       |
| `@askrjs/askr-lucide` | Lucide icon wrappers for Askr                        |
| `@askrjs/askr-cli`    | Project scaffolding and SSG workflows                |

### Platform tooling

| Package             | Purpose                                 |
| ------------------- | --------------------------------------- |
| `@askrjs/askr-vite` | Vite integration and project transforms |

## Repository Structure

```text
packages/
	askr-core/
	askr-ui/
	askr-themes/
	askr-lucide/
	askr-cli/

docs/
scripts/
.github/
```

## Prerequisites

- Node.js 20+
- npm 10+

## Setup

```bash
npm install
```

## Common Commands

Run from the repository root.

```bash
npm run verify:monorepo   # validate workspace/package invariants
npm run lint              # root + workspace lint
npm run build             # build all workspaces
npm test                  # run all workspace tests
npm run fmt               # format root + workspaces
```

Run a command in a single workspace:

```bash
npm run --workspace @askrjs/askr build
npm run --workspace @askrjs/askr-ui test
```

## Documentation

Platform docs are centralized under `docs/`.

- Start here: `docs/index.md`
- Platform overview: `docs/README.md`

## Contributing

- Contributor guide: `CONTRIBUTING.md`
- Agent-specific workflow and guardrails: `AGENTS.md`

## CI Gate

Pull requests are expected to pass:

1. `npm run verify:monorepo`
2. `npm run lint`
3. `npm run build`
4. `npm test`
