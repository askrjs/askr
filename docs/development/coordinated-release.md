# Development: Coordinated Release

How to ship a breaking release across the `@askrjs` package set.

[Release](./release.md) covers publishing one package. This document covers the
part that only appears when every package moves at once: the packages depend on
each other by range, so a breaking bump cannot be published — or even verified —
in arbitrary order.

## Why CI is red before the first publish

Every repo declares its siblings by range, for example `>=0.3.0 <0.4.0`. Until
the first package is on npm, `npm ci` in every dependent repo fails with:

```
npm error code ETARGET
npm error notarget No matching version found for @askrjs/askr@>=0.3.0 <0.4.0.
```

This is expected and is not a code failure. It clears wave by wave as packages
publish. Do not "fix" it by loosening ranges back to the previous major.

## Publish order

Ordered by runtime and peer edges. Everything in a wave can publish in parallel;
a wave cannot start until the previous one is fully on npm.

| Wave | Packages |
| ---- | -------- |
| 1 | `auth`, `fetch`, `orm`, `otel`, `schema`, `testing`, examples |
| 2 | `askr` |
| 3 | `charts`, `cli`, `i18n`, `logos`, `lucide`, `monaco`, `server`, `ui` |
| 4 | `node`, `themes` |
| 5 | `vite`, destroyer, website |

Regenerate the table after any dependency change:

```sh
node scripts/publish-order.mjs
```

## Lockfiles must be regenerated after each wave

This is the step most likely to be missed.

Bumping a range in `package.json` does **not** update the resolved tree in
`package-lock.json`. A lockfile can declare `>=0.3.0 <0.4.0` at its root while
still resolving `node_modules/@askrjs/askr` to `0.2.4`. `npm ci` installs
strictly from that tree, so the repo keeps failing after its dependencies are
published, and the failure still looks like the ETARGET error above.

After each wave lands on npm, in every repo that depends on it:

```sh
npm install                 # re-resolves the tree against the published versions
git diff package-lock.json  # expect node_modules/@askrjs/* to move to 0.3.x
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

- [ ] Previous wave fully published to npm
- [ ] `npm install` re-run and the lockfile diff committed in each repo
- [ ] `npm ci` succeeds from a clean tree
- [ ] Package CI green on the real gate, not just on install
- [ ] CHANGELOG entry records every breaking removal
- [ ] Publish, then confirm the version is live before starting the next wave

## See also

- [Release](./release.md)
- [Peer dependencies across the monorepo](./peer-dependencies-monorepo.md)
- [Platform versioning](./platform-versioning.md)
