# Contributing to Askr

Thanks for contributing to Askr.

This repository is the monorepo for official Askr platform packages. The goal is to keep
runtime behavior, UI primitives, CLI workflows, and docs cohesive.

## Prerequisites

- Node.js 20+
- npm 10+

## Local Setup

```bash
git clone https://github.com/askrjs/askr.git
cd askr
npm install
```

## Development Workflow

1. Create a branch from `main`.
2. Make focused changes with tests/docs when behavior changes.
3. Run the full quality gate locally.
4. Open a pull request with a clear description.

## Required Checks Before PR

Run from repo root:

```bash
npm run verify:monorepo
npm run lint
npm run build
npm test
npm run fmt
```

CI enforces the same checks.

## Workspace Commands

You can target a single package with `--workspace`:

```bash
npm run --workspace @askrjs/askr build
npm run --workspace @askrjs/askr-ui test
npm run --workspace @askrjs/askr-cli lint
```

## Coding Guidelines

- Prefer clear, explicit code over clever abstractions.
- Keep public APIs stable and intentional.
- Match existing naming and file organization patterns.
- Avoid introducing new dependencies unless justified.
- Keep changes scoped: no unrelated refactors in the same PR.

## Cancellation and Async Work

Use `AbortController` for cancellation. Do not introduce custom cancellation primitives.
Forward `signal` through APIs when async work may outlive lifecycle boundaries.

## Documentation Expectations

- Keep platform docs under `docs/`.
- Write docs as one platform narrative, not isolated package stories.
- Update docs when user-facing behavior changes.

Primary entry points:

- `docs/index.md`
- `docs/README.md`

## Testing Expectations

- Add or update tests for behavior changes.
- Keep tests deterministic.
- Do not merge with failing or skipped suites.

## Commit and Pull Request Guidance

### Commit messages

Use concise, scoped commit messages. Example:

```text
feat(router): add route guard redirect support
fix(cli): preserve startkit css layer order
docs(core): clarify SSR sync constraints
```

### Pull requests

Include:

- What changed
- Why it changed
- Any migration impact
- Test coverage added/updated
- Docs updated (if applicable)

## Release and Versioning

Askr packages follow semver. Breaking changes require clear migration notes.

See:

- `docs/development/release.md`
- `.github/workflows/publish.yml`

## Need Help?

- Open a draft PR early for design feedback.
- Reference `AGENTS.md` for agent-assisted contribution guardrails.
