# Platform Versioning

Askr uses each package repository's `package.json` version as the source of truth. Package releases are coordinated by policy, not by a repository-level platform version file.

## Update workflow

1. Bump the `package.json` version for each package that is part of the release.
2. Run the relevant quality gates in each affected package repository:

```bash
npm run build
npm test
npm run lint
```

## Why

Keeping version state in package manifests avoids a second contract that can drift from npm publish metadata.
