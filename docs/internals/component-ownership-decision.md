# Component execution and state ownership (#575)

Status: **GO for continued internal evaluation; NO-GO for a public setup API or
sibling migration.** The current core proof supports lifetime setup as a viable
direction. Its helper remains internal and is not included in a package export.

## Existing contract

An ordinary component function runs at mount and again when its props or a
readable value read by its render changes. Each run resets a hook cursor.
`state()`, `derive()`, `selector()`, `watch()`, `stream()`, `task()`, and other
lifecycle calls claim typed slots by call order. `resource()` claims a `state()`
slot for its holder. A later component run must claim the same count and kinds
of slots. A changed sequence throws for a component body; a function child can
instead remount with fresh state. These user-visible rules remain the public
compatibility contract, covered by the existing hook-order and state tests.

The current `ComponentInstance` owns those cells and computations in the core
`Owner` tree. Its abort signal and cleanup callbacks end with that lifetime.
Keyed children and `For` rows retain their own lifetimes while their keys
remain; removal or a changed key disposes the old lifetime. `watch()` starts
after commit and stops its previous generation before observing a new one.
`resource()` starts client work after commit, publishes into a stable snapshot,
and aborts its work on refresh or disposal. SSR requires synchronous resource
data or supplied preload data. A failed render discards commit operations and
the transaction restores provisional renderer and ownership changes; state
writes made before the failed render are not automatically undone.

Since #485 (delivered in #607), `For`, `Show`, and `Case` are lazy boundary
components with their own lifetimes and hook slots. In a legacy component, an
ordinary branch or loop is safe when it does not change the component's hook
sequence. In a setup component, those same constructs may control ordinary JSX
and nested component nodes; lifecycle declarations stay in setup.

| Example                     | Positional rerun component                                                                                     | Lifetime setup direction                                                                              |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `if`, early return, ternary | Safe when the branch does not change hook calls; conditional lifecycle declarations violate the hook contract. | Safe in the render callback; setup declarations run once.                                             |
| Changing loop               | Ordinary keyed JSX is safe; lifecycle calls in the loop change the slot sequence.                              | Ordinary keyed JSX and nested component nodes are safe; lifecycle declarations stay outside the loop. |
| Nested component            | Each child owns a separate positional sequence and lifetime.                                                   | A child may use either model and owns its own lifetime.                                               |
| Keyed remount               | A new key creates a component with fresh cells.                                                                | A new key creates a component with fresh setup state.                                                 |

## Decision and current-core proof

Use **setup once, render many** as the non-positional model to evaluate. Setup
creates state and lifecycle values once per component lifetime and returns a
render callback that receives current props. The callback may branch, return
early, and loop without changing lifecycle declarations. Existing positional
components remain supported without behavior changes.

The bounded prototype is in `src/core/component/setup.ts` and is connected to
the existing `ComponentInstance` execution path. It is not re-exported. The
current props accessor is backed by a lazily allocated signal, so ordinary
positional components allocate no props signal. Setup metadata is resolved once
per instance. Lifecycle calls from a setup render callback fail with a focused
error.

`tests/jsdom/component/setup-component-prototype.test.tsx` covers:

- One setup call across reactive state updates and changed props.
- Conditional output removing a nested child and running its cleanup.
- A setup-owned resource reading live props, refreshing on change, and aborting
  the prior request.
- A failed render retaining committed DOM and state, followed by recovery on the
  same component lifetime.
- Rejection of lifecycle declarations from the render callback.
- SSR output adopted by hydration without replacing the server node.

Existing positional hook-order tests remain in place. #485 supplies lazy
`For`/`Show`/`Case` boundaries, and #492 supplies source-driven async APIs for
the existing model. The prototype uses an owned `watch()` to refresh its
resource from live props; this is proof of feasibility, not a final public
setup/resource contract. The prototype has not yet qualified async resource
preload keys under conditional setup declarations, nested setup components, or
all selective-hydration paths.

We reject positional reruns as the only component model because ordinary
conditional lifecycle declarations still need a hook-order rule. We reject
caching one JSX tree during setup because an async `resource()` publication can
leave a plain snapshot rendered as `pending`. We defer named-hook/keyed-slot
APIs because they add identity and collision rules to each declaration instead
of establishing ownership at one component boundary.

## Performance evidence and budget

The acceptance budget for this bounded prototype is no more than 5% aggregate
regression against positional components for like-for-like workloads. Five
same-runner production-mode tier 2 captures compared 100 stateful keyed rows.
Mount plus disposal measures allocation and teardown together; list updates
change every row's props and reverse the key order. Mean milliseconds and
setup-vs-positional deltas were:

| Capture | Positional mount/dispose | Setup mount/dispose | Delta | Positional list update | Setup list update |  Delta |
| ------- | -----------------------: | ------------------: | ----: | ---------------------: | ----------------: | -----: |
| 1       |                   0.8249 |              0.8199 | -0.6% |                 0.3872 |            0.3880 |  +0.2% |
| 2       |                   0.8125 |              0.8176 | +0.6% |                 0.3832 |            0.3813 |  -0.5% |
| 3       |                   0.8359 |              0.8359 |  0.0% |                 0.3979 |            0.4480 | +12.6% |
| 4       |                   0.8183 |              0.8207 | +0.3% |                 0.3825 |            0.3836 |  +0.3% |
| 5       |                   0.8240 |              0.8412 | +2.1% |                 0.3920 |            0.3850 |  -1.8% |
| Mean    |                   0.8231 |              0.8271 | +0.5% |                 0.3886 |            0.3972 |  +2.2% |

All measured relative margins of error were below 2.7%. Capture 3's setup
list-update sample had a 10.97 ms maximum; its p75 was 0.3803 ms versus 0.3698
ms positional (+2.8%). The other four list-update pairs were within 1%. This is
recorded as a high-tail outlier, not hidden or treated as a separate failure.
The aggregate comparison passes the 5% budget. The benchmark measures elapsed
time, not heap allocations independently; direct allocation profiling remains
required before any public rollout.

The full current-core tier 1 and tier 2 benchmark suites also passed on this
checkout. Representative tier 1 means were 0.5095 ms for stable updates to
1,000 keyed rows, 0.3881 ms for a distant keyed swap, 3.8778 ms to reverse
1,000 rows, and 40.1592 ms to append then clear 1,000 rows. Representative tier
2 means were 0.5001 ms for stable 1,000-row updates, 0.5953 ms to mount and
clean up 100 stateful rows (7.35% RME), 0.0283 ms for a 100-row parent update,
and 0.0462 ms for a 100-row reorder. Tier 1's 500-job scheduler flush had
10.04% RME; several tier 2 stress cases were also noisy. The prototype's
paired fixture is the direct comparison; these full-suite numbers are current
core baselines, not a direct comparison to the retired runtime.

The 5% budget is a gate for further prototype work, not blanket evidence that
every application will meet it. Re-run the paired workload and relevant tier 1
list benchmarks after changes to setup ownership. Re-qualify separately for
SSR, hydration, and direct allocation before a public API decision.

## Consumers and migration

This inventory was refreshed from the sibling checkouts on September 27, 2026.
The `askr-ui` checkout has existing unrelated local edits; it was inspected
read-only and none of those changes are part of this decision.

| Repository      | Current consumers                                                                                                                                    | Compatibility and migration path                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `askr`          | Public positional `state`, `derive`, `selector`, `watch`, `resource`, lifecycle APIs, controls, SSR, and hydration.                                  | Keep the API and its tests. Setup stays internal until its public gate is met.                                                                                  |
| `askr-ui`       | Stateful select, radio, menu, overlay, dialog, tooltip, avatar, toast, virtual-list, and virtual-table components; avatar/toast use async resources. | No mass conversion. If setup becomes public, pilot one simple leaf, one async component, and one virtualized list with package behavior and performance checks. |
| `askr-cli`      | Analyzer lifecycle-contract rules and templates advise stable hook order and top-level state/resource declarations.                                  | Keep current guidance for legacy components. Add setup-specific rules or templates only with a public contract.                                                 |
| `askr-server`   | Server and MCP `.resource()` registrations are backend APIs; no UI component lifecycle primitives were found in its source.                          | No direct component migration. Preserve backend resource APIs and validate SSR data compatibility before changing runtime key semantics.                        |
| `askr-examples` | SPA, SSG, SSR-only, and API-SSR pages use positional state/derive; the MCP example uses backend resource registration.                               | Keep examples runnable. If setup becomes public, add one small example and smoke all four UI rendering modes before migration.                                  |

This is additive while the positional API remains supported. No deprecation is
scheduled. Existing positional components remain the escape hatch unless a
future major-version decision proposes otherwise. No sibling migration or
release is part of this proof.

## Go/no-go gate

**Go:** continue internal design review and focused prototype work on the
current core. The compatibility path is intact, the representative behavioral
proof passes, and the aggregate tier 2 comparison is inside budget.

**No-go:** do not publish the setup component API, change CLI guidance, or
migrate sibling packages yet. Before that decision, specify and test context
provisioning, conditional setup-owned child cleanup, nested setup components,
async refresh and rollback, SSR preload/resource keys under branch changes,
selective hydration identity, direct allocation cost, and representative
askr-ui/example consumer acceptance. Retain positional APIs throughout; no
deprecation date or compatibility break is implied.

#485's lazy boundaries and #492's source-driven async design are prerequisites
already delivered in the current core. Their contracts remain complementary:
lazy boundaries isolate child lifetimes, while setup determines where a
component declares its own lifecycle values. This issue's proof does not claim
that positional hook-order rules have been removed from legacy components.
