# Critical runtime coverage and hardening

Measured on 2026-10-09 with Node 24.21.0, Vitest 5.0.1 and the core checkout
at `d028846203ddf80f312589545e7f78de619af604`, plus the tests described below.
This is evidence for issues #743 and #748, not complete release qualification.

## Repeatable measurement

Install the repository dependencies and Playwright Chromium, then run:

```sh
npm run test:coverage
```

`vitest.coverage.config.ts` extends the existing unit, jsdom and browser
configurations as three projects. V8 merges their coverage in one run. The
measurement includes every TypeScript implementation under `src/core/dom`,
`src/ssr`, `src/data` and `src/router`, including files not imported by a test.
Declaration files are excluded. There are no per-file implementation exclusions.
The projects retain their existing development environment definitions; this
report does not measure a separately compiled production bundle.

Reports are written to `coverage/runtime/`: `coverage-final.json` has individual
statement/function/branch counters, `coverage-summary.json` has per-file totals,
and `index.html` links to the annotated source. CI and the three-OS main matrix
retain this directory as an artifact even after a failed coverage gate.
`release:verify` also runs the coverage command. The existing unit, repository,
jsdom, browser, public type and packed consumer checks still run separately.

The browser coverage project uses Chromium, the default `ASKR_BROWSER` value.
Do not select Firefox or WebKit for this command: they do not expose the V8
coverage interface. Their normal browser/quality suites remain separate
behavior gates. See the [Vitest coverage guide](https://vitest.dev/guide/coverage.html).
Repository checks and type-only fixtures do not contribute runtime coverage.

## Baseline and regression floors

The initial aggregate passed 3,309 cases: 452 unit, 2,699 jsdom and 158 browser.
Percentages below are the sum of covered counters divided by the sum of total
counters in each directory, rather than an average of file percentages.

| Area   | Lines              | Branches           | Functions        | Statements         |
| ------ | ------------------ | ------------------ | ---------------- | ------------------ |
| DOM    | 94.62% (1847/1952) | 89.72% (1301/1450) | 97.51% (313/321) | 92.85% (2052/2210) |
| SSR    | 93.02% (973/1046)  | 85.55% (687/803)   | 95.05% (192/202) | 91.24% (1073/1176) |
| Data   | 94.15% (917/974)   | 88.27% (557/631)   | 98.45% (191/194) | 93.10% (971/1043)  |
| Router | 92.55% (1490/1610) | 87.12% (1251/1436) | 92.78% (347/374) | 91.53% (1610/1759) |

The configured directory floors round this measured baseline down to whole
percentages. Each directory is checked independently; coverage gained in SSR
cannot hide a loss in router coverage. Floors are not automatically updated. A full diagnostic run with each directory's line floor raised to 100 passed all 3,318 behavior cases, then exited nonzero
with four named directory-threshold errors. The intended floors remain unchanged.

| Glob              | Lines | Branches | Functions | Statements |
| ----------------- | ----- | -------- | --------- | ---------- |
| `src/core/dom/**` | 94    | 89       | 97        | 92         |
| `src/ssr/**`      | 93    | 85       | 95        | 91         |
| `src/data/**`     | 94    | 88       | 98        | 93         |
| `src/router/**`   | 92    | 87       | 92        | 91         |

The expanded run passed 3,318 cases (454 unit, 2,706 jsdom and 158 browser). DOM coverage increased to 94.77% lines
(1850/1952), 90.14% branches (1307/1450) and 93.03% statements (2056/2210).
SSR increased to 93.12% lines (974/1046), 85.68% branches (688/803) and 91.33%
statements (1074/1176). Function, data and router totals were unchanged. Existing
data/router regression cases already exercise the transitions below; their
assertions are retained instead of duplicating them for a larger case count.

## Executed behavior probes

The adjacent pass inspected the source and existing assertions before adding
cases. It distinguishes rollback before publication from diagnostics after a
successful commit. In particular, hydration client-output verification reports
a mismatch after DOM reconciliation; it does not undo that committed render.
The earlier server-snapshot check rejects before mounting. Both paths are tested.

| Invariant or interaction                                                     | Assertion evidence and outcome                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A mutating style writer failure restores earlier writes, then retry succeeds | New `tests/jsdom/ssr/namespaced-style-failure-retry.test.tsx`: four cases combine hydration/update with absent/existing `xlink:href`. A real CSSOM write mutates and throws; namespace, class, style and element identity are restored. Retry sets important priority, removes an old owned property, retains a foreign update property and remains repeatable. No defect found.                                                          |
| Owner disposal retires pending work despite a throwing sibling cleanup       | New `tests/jsdom/runtime/pending-owner-failed-cleanup.test.tsx`: two late-fetch outcomes combine a pending query, an async mount cleanup and a throwing synchronous cleanup. Owner/transport signals abort, the immediate-GC cache empties, late resolve/reject cannot render or write DOM, late mount cleanup runs once, and repeated disposal reports no duplicate failure. No defect found.                                            |
| SSR cleanup drains all temporary owners and keeps errors on the render path  | Extended `tests/unit/ssr/temporary-owner-cleanup.test.tsx`: successful and throwing renders each have two failing cleanups. All failures remain in the synchronous aggregate in disposal order; owners are disposed, no deferred report escapes and a fresh render succeeds. No defect found.                                                                                                                                             |
| Portal client mismatch is reported after commit and can be cleaned up        | Extended `tests/jsdom/ssr/default-portal-hydration-parity.test.tsx`: the adopted node holds client text when verification rejects. The committed app remains discoverable, cleanup removes it, and a fresh SSR snapshot is adopted on retry. Existing portal render-failure and deferred insertion/removal rollback cases retain original server nodes. No defect found.                                                                  |
| Missing server content rejects before mount and can be restored for retry    | Extended `tests/jsdom/ssr/hydration.test.tsx`: removing an actual SSR button causes verification rejection without changing parent/tail identity or mounting an app. The detached button has no client handler. Restoring it permits in-place adoption and exactly one handler invocation. No defect found.                                                                                                                               |
| A later root failure preserves every previously committed root               | Existing `tests/jsdom/router/multi-root-isolation.test.tsx` injects second-root insertion failure. Both roots and URL remain at the previous route, destination refs and old-owner cleanup do not run, and retry publishes both roots once. Render failure also disposes candidate owners without invalidating prior state. No defect found.                                                                                              |
| Newer navigation owns document publication                                   | Existing `tests/jsdom/router/navigation-resolution-ownership.test.tsx` settles stale metadata after a newer commit and asserts node, title, URL, history length and state identity. Its push/popstate abort-listener cases assert one newest loader, no interrupted loader and the correct live signal. The reproduced request ownership defects were fixed in PR #766; see [navigation ownership](../internals/navigation-ownership.md). |
| Query callbacks cannot publish obsolete generations                          | Existing `tests/unit/data/query-callback-generation.test.ts` and DOM query lifetime cases retain the reproduced callback/abort-listener regressions from PR #764. They cover stale result/error suppression, retries created during reconciliation and cache reattachment during disposal. See [query lifetime ownership](../internals/query-lifetime-transitions.md).                                                                    |
| Failed hydration releases provisional state and keeps retry usable           | Existing resource-claim, mixed prop lifetime, deferred portal and child-sync rollback cases assert original nodes/values/listeners/refs and retry behavior. The resource-cursor context leak was reproduced and fixed in PR #762; host writer extraction in PR #763 retained all 49 compiled function bodies.                                                                                                                             |

All rows above are covered by assertions and executed suites. The five extended
or new families add nine cases and strengthen an existing portal case. They do
not change production code or introduce a new confirmed runtime defect.

## Remaining measurement limits

Coverage is a regression signal, not proof that every state-machine ordering is
correct. Remaining branches include defensive malformed-key/stream sink paths,
metadata/store validation, and alternate rollback/cleanup failures. Some
navigation-commit checks are unreachable through the supported root preparation
contract (for example, its default retirement list is always an array). Those
files remain measured; fabricated host objects are not used to inflate coverage.

Production bundles, unsupported browser instrumentation and complete cross-package
0.5 candidates need their own qualification. Benchmark capture is kept free of
coverage instrumentation. The runtime probes above require no new performance
comparison because the implementation is unchanged.
