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

- `.github/workflows/ci.yml`: lint, build, publint, benchmark-contract,
  architecture checks, public type contracts, unit/jsdom tests, a packed
  clean-consumer smoke test, and Chromium integration coverage.
- `.github/workflows/quality.yml`: PR and scheduled replayable lifecycle sequences
  plus Chromium and Firefox on Linux and WebKit on macOS. Failed runs retain
  browser reports and seed-trace artifacts.
- `.github/workflows/publish.yml`: manual release workflow. It installs Chromium
  and runs the complete release gate before any tag is created. A reused tag
  must resolve to that verified commit; only then can the workflow publish it.
- `.github/workflows/bench.yml`: manual benchmark runner for stable and browser
  perf lanes. It captures three repetitions on one pinned host, raw tier JSON,
  and commit/OS/architecture/CPU/Node context. The tracked tier benchmark files
  and `docs/benchmarks/performance-targets.md` define the maintained contract.
- `prepack`: always rebuilds package artifacts before npm creates a tarball.
- `prepublishOnly`: runs `npm run release:verify`; manual npm publishing cannot
  skip lint, build, checks, public types, test suites, or the packed consumer
  contract. The Chromium browser integration suite is part of that gate.
- The packed consumer and development checks run on the current LTS toolchain,
  which must satisfy the package's declared Node.js engine.

The packed consumer contract imports every exported subpath from a fresh ESM
install, verifies the matching emitted declaration files, runs a minimal
runtime/SSR render and rejects source maps in the
tarball. It removes `dist` before rebuilding, so the check cannot pass against
stale artifacts. Local and CI builds retain maps for debugging; npm packages do
not.

`npm run test:installed` also runs the frozen public type examples and consumer
behavior fixtures against the installed tarball. PR CI checks scheduler/host
configuration, lifecycle ordering, hydration adoption, navigation cancellation,
and server execution without browser globals from that package boundary.

Core consolidation also qualifies packed artifacts in isolated sibling
checkouts. Record each consumer commit, its original installed baseline, the
candidate tarball digest, dependency resolution, and build/type/test results.
Install the candidate throughout the consumer dependency tree; a successful
check against a nested registry copy is not candidate evidence. Keep sibling
source checkouts unchanged. Generate SPA, SSR, and SSG applications using a
packed CLI and run their complete `check` commands with the candidate installed.
SSG qualification also verifies the generated sitemap, robots file, and manifest.
This qualification does not publish a package or require a version change.

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
- Do not create a tag or publish until every local and workflow gate is green.

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
