# Lazy control boundary baseline (#485)

This is a characterization checkpoint at `develop` commit `bd95fed`.
`tests/jsdom/control/lazy-show-boundary.test.tsx` records eight desired
behaviors with `it.fails`. Each was run as an ordinary failing test first.
An expected failure is not a passing implementation: convert each case to
`it` when its boundary is independently owned.

| Desired behavior                                       | Current observed result                                       |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| `Show` in a parent ternary or after an early return    | `state()` claims an extra parent hook slot and throws         |
| A changing loop of keyed `Show` elements               | The added element claims an extra parent hook slot and throws |
| A `Show` reading a source without rerunning its parent | Two toggles rerun the parent twice (three total runs)         |
| A changed `Show` key remounting branch-local state     | The old button and count remain                               |
| A `For` under a hidden `Show`                          | Its source is read once while JSX children are created        |
| `For` in a parent ternary                              | `<For>` claims an extra parent hook slot and throws           |
| `Case` after an early return                           | Its state claims an extra parent hook slot and throws         |

Existing tests in `state/hook-order-enforcement.test.tsx` assert today's
positional rule. The new tests assert the desired control-boundary contract,
so both models are visible during migration. The #575 lifetime setup proof is
separate and remains an internal draft; lazy controls must also work in
legacy components.

## Why the first `Show` conversion was not retained

Making `Show` an ordinary component vnode made the four direct `Show` tests
pass. It also failed six existing tests: four empty `Show` hydration cursor
cases, a multi-node control range adoption case, and an adjacent inactive
boundary followed by a keyed `For` workspace. Marking `Show` as transparent
and widening component-range detection fixed only three of those failures.
The server markup uses one pair of `askr-range` markers for the control
boundary; wrapping that boundary in a component introduces a second lifetime
whose hydration and commit paths cannot simply create another range. The
next implementation needs an explicit rule for adopting one physical range
into both component and control ownership, including rollback and adjacent
sibling cursors. A one-line eager-flag removal is not sufficient.

## Performance checkpoint

One local production-mode sample on the unchanged commit measured:

| Workload                                      |      Mean |   RME |
| --------------------------------------------- | --------: | ----: |
| `Show` truthy/fallback toggle                 | 0.0191 ms | 1.25% |
| `Case` branch toggle                          | 0.0180 ms | 1.29% |
| Mount and cleanup of 1,000 component wrappers |  2.838 ms | 4.91% |
| Hydrate a 1,000-row table                     | 58.982 ms | 1.81% |
| Swap distant keyed rows                       | 0.9322 ms | 2.24% |
| Update every tenth keyed row                  | 0.4253 ms | 3.14% |

This sample is a diagnostic starting point, not an acceptance baseline.
Use `docs/benchmarks/performance-targets.md`: three paired same-runner
baseline/candidate captures of identical workloads, RME at or below 15%,
and no more than 5% regression in touched guardrails without a separately
approved trade-off. Keep the existing tier 1 list workloads unchanged, and
measure `Show`/`Case` toggles, SSR/hydration, component mount and cleanup,
and `For` updates after each conversion.

Implementation order remains `Show`, then `Case`/`Match`, then `For`, with
each step exercising keyed identity, cleanup, transaction rollback,
SSR output, hydration node adoption, portals, and sibling package smoke.
