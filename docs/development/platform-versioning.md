# Platform Versioning

Askr uses each workspace package's `package.json` version as the source of truth. The old repository-level `platform-version.json` contract and its separate validation step have been retired.

## Update workflow

1. Bump the `package.json` version for each package that is part of the release.
2. Run the root checks that still apply:

```bash
node scripts/validate-monorepo.js
```

3. Run the normal quality gates before publishing:

```bash
npm run lint
npm run build
npm test
```

## Why

Keeping version state in package manifests avoids a second contract that can drift from npm publish metadata.
