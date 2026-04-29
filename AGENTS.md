# AGENTS.md

Operational guide for coding agents working in this monorepo.

This file defines repository-specific expectations for AI/code agents.

## Scope

Applies to the repository root and all workspace packages.

## Repository Map

```text
packages/
  askr-core/
  askr-ui/
  askr-themes/
  askr-lucide/
  askr-cli/

docs/
scripts/
```

## Ground Rules

1. Make minimal, focused changes.
2. Preserve existing public APIs unless the task explicitly requires breaking changes.
3. Do not modify unrelated files.
4. Keep docs aligned with behavior changes.
5. Prefer ASCII unless a file already requires Unicode.

## Required Validation

Before considering work complete, run from root:

```bash
node scripts/validate-monorepo.js
npm run lint
npm run build
npm test
npm run test:types
npm run bench
npm run verify:release
npm run fmt
```

If a task only touches one package and full-run is expensive, run package-local checks first,
then run the relevant root gate(s).

## Package-Local Commands

```bash
npm run --workspace @askrjs/askr <script>
npm run --workspace @askrjs/ui <script>
npm run --workspace @askrjs/themes <script>
npm run --workspace @askrjs/lucide <script>
npm run --workspace @askrjs/cli <script>
```

## Documentation Contract

When behavior, APIs, or workflows change, update docs under `docs/` in the same change.

Primary docs entry points:

- `docs/index.md`
- `docs/README.md`

## Runtime and Async Conventions

- Use `AbortController` for cancellation semantics.
- Forward `signal` rather than creating custom cancel APIs.
- Keep async behavior deterministic and testable.
- Do not hardcode Askr theme tokens (for example `--ak-*`) in runtime TS/JS; keep token definitions and mappings in theme CSS.

## Editing Rules

- Prefer patch-style edits for existing files.
- Avoid broad reformatting unless requested or required by lint/format tools.
- Never revert user-authored changes outside task scope.

## Pull Request Quality Bar

A change is ready when:

1. All required checks pass.
2. New/changed behavior has tests.
3. Docs reflect user-facing changes.
4. Diff is scoped and reviewable.

## When Unsure

Default to the canonical Askr approach:

- convention over configuration
- composition over prop bloat
- headless-first UI behavior
- platform cohesion over per-package divergence
