# Platform Charter

Askr is a contract-driven platform built from distinct packages that are designed to work together.
The monorepo exists so those packages can share one build, one release discipline, and one design
vision without collapsing into a single large package.

## Core idea

The platform is split by responsibility, not by implementation convenience:

- `@askrjs/askr` provides the runtime foundation: rendering, routing, lifecycle, SSR, SSG, and
  shared primitives.
- `@askrjs/askr-ui` provides headless interaction semantics and accessibility behavior.
- `@askrjs/askr-themes` provides optional presentation through CSS tokens and component styling.
- `@askrjs/askr-lucide` provides generated icon wrappers for common app surfaces.
- `@askrjs/askr-cli` provides project scaffolding and workflow tools.
- `@askrjs/askr-vite` provides Vite integration for the runtime and starter workflows.
- `@askrjs/eslint-plugin-askr` provides repository guardrails so the platform stays consistent.

## How the parts work together

The intended dependency flow is simple:

1. Applications depend on `@askrjs/askr` as the runtime contract.
2. UI packages build on runtime foundations, not on each other’s internals.
3. Themes provide presentation for the UI layer without adding runtime behavior.
4. Icon wrappers stay thin and deterministic so they can be swapped or regenerated easily.
5. CLI and Vite improve the developer experience without becoming runtime dependencies.
6. The ESLint plugin enforces the architecture instead of participating in it.

That model keeps the package boundaries visible while still making the platform feel cohesive.

## Operating rules

- Public packages should expose stable, documented subpaths and avoid hidden cross-package imports.
- Generated output must be deterministic and reviewable.
- Build and type-check behavior should be predictable from package metadata, not from ad hoc scripts.
- Package roles should be obvious from the package name and docs.
- Consolidation is only worth doing when two packages no longer have distinct contracts.

## What the platform should avoid

- A single catch-all package that hides the difference between runtime, styling, tooling, and guardrails.
- Manual duplication of package metadata across scripts, export maps, and docs.
- Package-manager-specific behavior that changes the contract depending on the machine.
- Internal implementation details leaking across package boundaries.

## Related docs

- [Package map](../reference/package-map.md)
- [Repository structure](./repo-structure.md)
- [Platform overview](../getting-started/platform-overview.md)
