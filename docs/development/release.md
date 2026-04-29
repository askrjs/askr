# Development: Release

Release process for Askr platform packages.

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

- `.github/workflows/ci.yml`: lint, build, unit/jsdom tests, and browser integration coverage.
- `.github/workflows/tag.yml`: manual workflow that runs CI and creates a `v<version>` tag from `package.json`.
- `.github/workflows/release.yml`: creates a GitHub release from an existing tag.
- `.github/workflows/publish.yml`: publishes an existing release tag to npm.
- `.github/workflows/bench.yml`: manual benchmark runner for stable and browser perf lanes.

The intended happy path is:

1. Bump `package.json` to the release version.
2. Run `tag.yml` manually.
3. Let the pushed tag trigger `release.yml`.
4. Let the published GitHub release trigger `publish.yml`.

`release.yml` and `publish.yml` also support `workflow_dispatch` with a required
`release_tag` input. They check out that exact tag before running, which keeps
manual recovery runs pinned to the intended release artifact.

## Pre-release checklist

- All tests pass: `npm run test`
- All lints pass: `npm run lint`
- CHANGELOG updated
- Version bumped in `package.json`

## Failure recovery

Use the smallest recovery step that matches the failure point.

### CI failures

- Fix the code or workflow issue.
- Rerun `ci.yml`, or rerun `tag.yml` if you are in the middle of a release.

### Tag or release failures

- If tag creation failed before the tag was pushed, rerun `tag.yml`.
- If the tag already exists but the GitHub release failed, rerun `release.yml` manually with `release_tag` set to that tag.

### Publish failures

- First check whether npm already received the version.
- If the version was not published, rerun the failed publish job or manually run `publish.yml` with `release_tag` set to the release tag.
- If npm did publish the version, do not retry the same version. npm versions are immutable. Bump `package.json` to a new version and start a new tag -> release -> publish cycle.

The main footgun is partial success after npm accepts the version. GitHub can
report a failed workflow even though npm already owns that version, so always
check npm before retrying publish.

## See also

- [Repo structure](./repo-structure.md)
- [Contributing](./contributing.md)
