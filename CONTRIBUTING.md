# Contributing to Askr

Thanks for contributing to Askr.

This repository owns the `@askrjs/askr` runtime package and the platform-level
documentation. Related packages such as `askr-ui`, `askr-themes`, `askr-cli`,
`askr-vite`, `askr-lucide`, and `askr-charts` are maintained in sibling
repositories.

## Prerequisites

- Node.js 24.15+ (LTS)
- npm 10+

## Local Setup

```bash
git clone https://github.com/askrjs/askr.git
cd askr
npm install
```

## Development Workflow

1. Create a branch from `main`.
2. Make focused changes with tests or docs when behavior changes.
3. Run the relevant quality gates locally.
4. Open a pull request with a clear description.

## Required Checks Before PR

Run the checks that apply to the change:

```bash
npm run lint
npm run build
npm test
npm run test:types
```

For performance-sensitive runtime changes, also run the relevant benchmark
script from `package.json`.

## Coding Guidelines

- Prefer clear, explicit code over clever abstractions.
- Keep public APIs stable and intentional.
- Match existing naming and file organization patterns.
- Avoid introducing new dependencies unless justified.
- Keep changes scoped; do not mix unrelated refactors into the same PR.

## Cancellation and Async Work

Use `AbortController` for cancellation. Do not introduce custom cancellation
primitives. Forward `signal` through APIs when async work may outlive lifecycle
boundaries.

## Documentation Expectations

- Keep platform docs under `docs/`.
- Keep package-specific reference docs in the package repository that owns the behavior.
- Update docs when user-facing behavior changes.

Primary entry points:

- `docs/index.md`
- `docs/README.md`

## Testing Expectations

- Add or update tests for behavior changes.
- Keep tests deterministic.
- Do not merge with failing or skipped suites.

## Pull Request Guidance

Include:

- What changed
- Why it changed
- Any migration impact
- Test coverage added or updated
- Docs updated, when applicable

## Release and Versioning

Askr packages follow semver. Breaking changes require clear migration notes.

See:

- `docs/development/release.md`
- `docs/development/platform-versioning.md`

## Need Help

- Open a draft PR early for design feedback.
- Reference `AGENTS.md` for agent-assisted contribution guardrails.
