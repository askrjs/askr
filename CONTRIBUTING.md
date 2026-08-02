# Contributing to Askr

Thanks for contributing to Askr.

This repository owns the `@askrjs/askr` runtime package and the platform-level
documentation. Related packages such as `askr-ui`, `askr-themes`, `askr-cli`,
`askr-vite`, `askr-lucide`, and `askr-charts` are maintained in sibling
repositories.

## Organization Contribution Requirements

This repository follows the
[Askr organization contribution policy](https://github.com/askrjs/.github/blob/main/CONTRIBUTING.md).
Contributors must be using Askr, maintaining an Askr integration or community
resource, or evaluating Askr for a concrete project. Pull requests must briefly
describe that Askr context.

AI-assisted development and automation are welcome when disclosed. The person
opening the pull request must personally review the contribution, be able to
explain and maintain it, and remain available for substantive review follow-up.
Unattended contributions and mass-generated changes from parties without a
genuine interest in Askr are not accepted. New contributors should keep one
pull request open at a time unless a maintainer agrees otherwise.

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

- Your concrete Askr use, integration, or evaluation context
- What changed
- Why it changed
- Any migration impact
- Test coverage added or updated
- Docs updated, when applicable
- Any material AI or automation assistance, or `None`

## Release and Versioning

Askr packages follow semver. Breaking changes require clear migration notes.

See:

- `docs/development/release.md`
- `docs/development/platform-versioning.md`

## Need Help

- Open a draft PR early for design feedback.
- Reference `AGENTS.md` for agent-assisted contribution guardrails.
