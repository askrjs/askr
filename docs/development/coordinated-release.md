# Development: Coordinated Release

How to ship a breaking release across the `@askrjs` package set.

[Release](./release.md) covers publishing one package. This document covers the
part that only appears when every package moves at once: the packages depend on
each other by range, so a breaking bump cannot be published — or even verified —
in arbitrary order.

## Why CI is red before the first publish

For 0.5.0, package manifests must move sibling ranges to `>=0.5.0 <0.6.0`. Until
the first package is on npm, `npm ci` in every dependent repo fails with:

```
npm error code ETARGET
npm error notarget No matching version found for @askrjs/askr@>=0.5.0 <0.6.0.
```

This is expected and is not a code failure. It clears wave by wave as packages
publish. Do not "fix" it by loosening ranges back to the previous major.

## Publish order

Ordered by runtime and peer edges. Everything in a wave can publish in parallel;
a wave cannot start until the previous one is fully on npm.

| Wave | Packages                                                             |
| ---- | -------------------------------------------------------------------- |
| 1    | `auth`, `fetch`, `orm`, `otel`, `schema`, `testing`                  |
| 2    | `askr`                                                               |
| 3    | `charts`, `cli`, `i18n`, `logos`, `lucide`, `monaco`, `server`, `ui` |
| 4    | `node`, `themes`                                                     |
| 5    | `vite`                                                               |

This is the publication graph for the 18 public packages, checked against
`develop` manifests on 2026-10-09. Examples, Destroyer, and the website are
private integration consumers; validate them against the packed candidate set
before release and against registry packages afterward. They are not npm
publication steps.

Regenerate the table after any dependency change:

```sh
node scripts/publish-order.mjs
```

Pass an explicit sibling-checkout root when running from a release worktree:

```sh
node scripts/publish-order.mjs /path/to/askrjs
```

The command includes only public `@askrjs/*` manifests. If it finds duplicate
checkouts for a package, it prefers `askr` for the runtime and `askr-<name>` for
siblings. It rejects ambiguous duplicates rather than choosing whichever
directory is visited last. Use current, fetched release checkouts; the command
reads local manifests and does not refresh Git refs or npm.

Development dependencies are outside this publication graph. They can form
qualification cycles: for example, Charts tests use Vite even though Charts
publishes before Vite. Before publishing, install the complete packed candidate
set into isolated consumers and verify that all nested Askr dependencies resolve
to those candidates. This local qualification does not establish registry-backed
CI success or publication. Record the exact package commits and tarball digests.

## Lockfiles must be regenerated after each wave

This is the step most likely to be missed.

Bumping a range in `package.json` does **not** update the resolved tree in
`package-lock.json`. A lockfile can declare `>=0.5.0 <0.6.0` at its root while
still resolving `node_modules/@askrjs/askr` to `0.4.4`. `npm ci` installs
strictly from that tree, so the repo keeps failing after its dependencies are
published, and the failure still looks like the ETARGET error above.

After each wave lands on npm, in every repo that depends on it:

```sh
npm install                 # re-resolves the tree against the published versions
git diff package-lock.json  # expect node_modules/@askrjs/* to move to 0.5.x
npm ci                      # must now succeed from a clean tree
```

Only then is that repo's CI meaningful.

Guard this in the packages that already assert their own manifest surface — see
`tests/unit/package-surface.test.ts` in `@askrjs/themes`, which asserts both the
declared range and the resolved lockfile version. The declared range alone
passes on a half-updated lockfile.

## Merge order

Merge in the same wave order. A PR whose dependencies are unpublished cannot
have meaningful CI, so merging it early merges an unverified change.

## Checklist per wave

- [ ] API inventory and migrations accepted under [#745](https://github.com/askrjs/askr/issues/745)
- [ ] Each package's deeper hardening evidence accepted under [#747](https://github.com/askrjs/askr/issues/747)
- [ ] Complete packed candidate set qualified in isolated package/template consumers
- [ ] Previous wave fully published to npm
- [ ] `npm install` re-run and the lockfile diff committed in each repo
- [ ] `npm ci` succeeds from a clean tree
- [ ] Package CI green on the real gate, not just on install
- [ ] CHANGELOG entry records every breaking removal
- [ ] Publish, then confirm the version is live before starting the next wave

## See also

- [Release](./release.md)
- [0.5.0 readiness review](./0.5.0-readiness.md)
- [Platform versioning](./platform-versioning.md)
