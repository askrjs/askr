# Askr Monorepo Migration

## Status

This repository now contains the initial monorepo directory skeleton:

- `packages/askr`
- `packages/askr-ui`
- `packages/askr-themes`
- `packages/icons-lucide`
- `packages/askr-cli`

Current implementation progress:

- `askr` has been moved to `packages/askr`
- `askr-ui` has been imported to `packages/askr-ui`
- `askr-themes` has been imported to `packages/askr-themes`
- `icons-lucide` has been imported to `packages/icons-lucide`
- `askr-cli` package has been initialized under `packages/askr-cli`
- scaffolding templates have been copied into `packages/askr-cli/templates`
- askr-cli command entrypoints are implemented in `packages/askr-cli/src/bin/*.js`
- framework package-level `askr-ssg` bin ownership has been removed
- package-level docs have been consolidated into root `docs/` with per-package namespaces

## Step 1 Implementation Plan

1. Move the current `askr` codebase into `packages/askr` with history preserved. (done)
2. Move the current `askr-ui` codebase into `packages/askr-ui` with history preserved. (done)
3. Move the current `askr-themes` codebase into `packages/askr-themes` with history preserved. (done)
4. Import `icons-lucide` into `packages/icons-lucide`. (done)
5. After each move, run package-local build and test before continuing.
6. Consolidate package docs into root `docs/` and organize them by user journey and topic instead of package boundaries.

## Step 2 Strategy: Unified `askr-cli`

### Target outcome

Use a unified package named `@askrjs/askr-cli` to host all command-line workflows.

Initial command surface:

- `askr-ssg` (migrated from current framework package bin entry)
- `create` (migrated from `create-askr` behavior)

### Package layout

- `packages/askr-cli`
  - `src/bin/ssg.ts`
  - `src/bin/create.ts`
  - `src/bin/cli.ts`
  - `templates/` (merged from previous scaffolding package)

### Commands

All command-line workflows are exposed only via the canonical package:

- `npx @askrjs/askr-cli create`
- `npx @askrjs/askr-cli ssg`

## Sequencing

1. Complete directory imports for Step 1.
2. Add npm workspaces at repository root after moved packages have valid `package.json` files in their target directories.
3. Build the unified `askr-cli` package.
4. Remove `create-askr` and `askr` package-level CLI entry points during the same cutover.
5. Update docs and CI in one dedicated follow-up change.

## Notes

- `website` and `js-framework-benchmark` are intentionally out of this first migration scope.
- docs are centralized at root and organized by platform topics such as getting-started, guides, reference, internals, roadmap, and contributing.
