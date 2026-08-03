# AGENTS.md

Operational guide for coding agents working in the `askr` runtime repository.

This repository owns the core runtime and platform-level docs. Sibling package
repositories own their package-specific implementation and documentation.

## Scope

Applies to this repository only.

## Repository Map

```text
src/      - runtime, router, resources, SSR, SSG, JSX, and foundations
docs/     - platform-level documentation
tests/    - unit, jsdom, browser, accessibility, smoke coverage, and checks
benches/  - benchmark suites
tests/checks/ - repository validation helpers
```

## Ground Rules

1. Make minimal, focused changes.
2. Preserve existing public APIs unless the task explicitly requires breaking changes.
3. Do not modify unrelated files.
4. Keep docs aligned with behavior changes.
5. Prefer ASCII unless a file already requires Unicode.
6. Avoid new or restored `scripts/*` automation in this repository. Prefer real tests (`tests/checks`, `tests/unit`, `tests/jsdom`, `tests/browser`) for validation and guardrails, and encode behavior contracts in test assets instead of one-off scripts.
7. Avoid introducing workflow steps that execute `node`/`tsx` script files as ad-hoc policy, release, or benchmarking gates; prefer existing npm scripts and test assertions.
8. Keep workflows intentionally simple: prefer explicit, readable steps using existing scripts, and avoid complex inline bash orchestration unless it materially reduces risk or duplication.

## Required Validation

Run the checks that match the change:

```bash
npm run fmt -- --check
npm run lint
npm run build
npm test
npm run test:types
```

For performance-sensitive runtime changes, also run the relevant benchmark
script from `package.json`.

## Documentation Contract

When behavior, APIs, or workflows change, update docs under `docs/` in the same
change. Package-specific docs belong in the owning package repository.

Primary docs entry points:

- `docs/index.md`
- `docs/README.md`

## Runtime and Async Conventions

- Use `AbortController` for cancellation semantics.
- Forward `signal` rather than creating custom cancel APIs.
- Keep async behavior deterministic and testable.
- Do not hardcode Askr theme tokens such as `--ak-*` in runtime TS/JS.

## Editing Rules

- Prefer patch-style edits for existing files.
- Avoid broad reformatting unless requested or required by lint/format tools.
- Never revert user-authored changes outside task scope.

## Pull Request Quality Bar

A change is ready when:

1. Required checks pass.
2. New or changed behavior has tests.
3. Docs reflect user-facing changes.
4. Diff is scoped and reviewable.

## When Unsure

Default to the canonical Askr approach:

- convention over configuration
- composition over prop bloat
- headless-first UI behavior
- platform cohesion over package-local divergence
