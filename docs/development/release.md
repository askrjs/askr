# Development: Release

Release process for Askr packages.

## Versioning

Askr packages follow semantic versioning.

| Change type                  | Version bump |
| ---------------------------- | ------------ |
| Breaking API change          | Major        |
| New feature, backward-compat | Minor        |
| Bug fix, internal change     | Patch        |

## Release workflow

Packages are published to npm under the `@askrjs` scope.

The release flow is split across dedicated workflows:

- `.github/workflows/ci.yml`: lint, build, architecture checks, public type
  contracts, unit/jsdom tests, a packed clean-consumer smoke test, and Chromium
  integration coverage.
- `.github/workflows/quality.yml`: scheduled replayable lifecycle sequences
  plus Chromium and Firefox on Linux and WebKit on macOS. Failed runs retain
  browser reports and seed-trace artifacts.
- `.github/workflows/publish.yml`: manual release workflow. It runs CI, computes
  `v<version>` from `package.json`, creates the tag when needed, checks out that
  exact tag, builds it, and publishes it to npm.
- `.github/workflows/bench.yml`: manual benchmark runner for stable and browser perf lanes.
- `prepack`: always rebuilds package artifacts before npm creates a tarball.
- `prepublishOnly`: runs `npm run release:verify`; manual npm publishing cannot
  skip lint, build, checks, public types, test suites, or the packed consumer
  contract.

The packed consumer contract imports every exported subpath from a fresh ESM
install, verifies the matching emitted declaration files, runs a minimal
runtime/SSR render, checks the `askr-ssg` CLI, and rejects source maps in the
tarball. Local and CI builds retain maps for debugging; npm packages do not.

The intended happy path is:

1. Bump `package.json` to the release version and merge it to `main`.
2. Run `publish.yml` manually.
3. Confirm the workflow’s created-or-reused `v<version>` tag and npm publish.

## Pre-release checklist

- Full release gate passes: `npm run release:verify`
- Tarball inspection passes: `npm pack --dry-run --json` contains no `.map`
  files and includes JavaScript plus declaration artifacts for every export.
- CHANGELOG updated when the release needs notes
- Version bumped in `package.json`

## Failure recovery

Use the smallest recovery step that matches the failure point.

### CI failures

- Fix the code or workflow issue.
- Rerun `ci.yml`, or rerun `publish.yml` if you are in the middle of a release.

### Tag failures

- If tag creation failed before the tag was pushed, rerun `publish.yml`.
- If the tag already exists, `publish.yml` reuses it and checks it out before
  building and publishing.

### Publish failures

- First check whether npm already received the version.
- If the version was not published, rerun the failed publish job.
- If npm did publish the version, do not retry the same version. npm versions are immutable. Bump `package.json` to a new version and start a new publish cycle.

The main footgun is partial success after npm accepts the version. GitHub can
report a failed workflow even though npm already owns that version, so check npm
before retrying publish.

## See also

- [Repo structure](./repo-structure.md)
- [Contributing](./contributing.md)
