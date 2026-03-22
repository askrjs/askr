# Platform Versioning

Askr coordinates a platform release across runtime, UI, themes, CLI, docs, and benchmark-facing references.

## Source of truth

`platform-version.json` at repository root is the release contract for:

- `platformVersion`: the platform release identifier
- `workspacePackages`: required versions for all workspace packages
- `relatedProjects`: tracked external repos and default branches

## Update workflow

1. Bump package versions that are part of the release.
2. Update `platform-version.json` to match package versions exactly.
3. Run root validation:

```bash
npm run verify:monorepo
```

Validation includes:

- monorepo structure checks (`scripts/validate-monorepo.js`)
- platform version checks (`scripts/validate-platform-version.js`)

## Rules

- Every workspace package must be represented in `workspacePackages`.
- Every `workspacePackages` entry must exist in `packages/*/package.json`.
- Version strings must match exactly.
- Related project metadata must include `repository` and `branch`.

## Why this exists

A single contract prevents drift between package versions and platform claims, and creates a foundation for coordinated releases across related repositories.
