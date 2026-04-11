# Development: Release

Release process for Askr platform packages.

> This document is a work in progress.

## Versioning

Askr packages follow semantic versioning.

| Change type                  | Version bump |
| ---------------------------- | ------------ |
| Breaking API change          | Major        |
| New feature, backward-compat | Minor        |
| Bug fix, internal change     | Patch        |

## Release workflow

Packages are published to npm under the `@askrjs` scope.

The CI pipeline (`.github/workflows/publish.yml`) handles publication on tagged commits.

## Pre-release checklist

- All tests pass: `npm run test`
- All lints pass: `npm run lint`
- CHANGELOG updated
- Version bumped in `package.json`

## See also

- [Repo structure](./repo-structure.md)
- [Contributing](./contributing.md)
