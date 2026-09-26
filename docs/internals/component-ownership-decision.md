# Component execution and state ownership (#575)

Status: **choose lifetime setup as the direction; keep public migration gated**.
This record describes the existing contract and the internal proof on
`design/575-state-ownership`. `defineSetupComponent` is internal, is not in a
package export, and is not a supported application API.

## Existing contract

An ordinary component function runs at mount and again when its props or a
readable value read by its render changes. Each run resets a hook cursor.
`state()`, `derive()`, `selector()`, `watch()`, `stream()`, `task()`, and other
lifecycle calls claim a slot by call order. `resource()` claims a `state()`
slot for its holder. A later component run must claim the same count and kinds
of slots. A changed sequence throws for a component body; a function child
can instead remount with fresh state. These are user-visible rules, and the
existing state and hook-order tests remain the compatibility contract.

The component instance owns the cells, lifecycle slots, subscriptions, and an
`OwnershipRecord`. Its signal and cleanup callbacks end with that lifetime.
Keyed children and `For` rows retain their own lifetimes while their keys
remain; removal or a changed key disposes the old lifetime. `watch()` runs
after commit and stops its previous generation before observing a new one.
`resource()` starts client work after commit, publishes into a stable snapshot,
and aborts its work on refresh or disposal. SSR requires synchronous resource
data or supplied preload data. A failed render discards commit operations and
the transaction restores provisional renderer and ownership changes; state
writes made before the failed render are not automatically undone.

Today JSX creation calls `For`, `Show`, and `Case` eagerly in the parent
execution. Their calls can claim parent slots, so a plain `if`, ternary, or
changing loop around those controls can violate hook order. Issue #485 owns
moving those calls into lazy, separately owned control boundaries.

| Example                               | Current component                                                                      | Lifetime setup direction                                                                               |
| ------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `if`, early return, ternary in render | Safe only if they do not change the hook sequence; eager controls can change it        | Safe for ordinary JSX and nested component nodes in the render callback; lifecycle calls stay in setup |
| Changing loop in render               | Safe for ordinary keyed JSX; calling hooks or eager controls in the loop changes slots | Safe for ordinary keyed JSX; lazy controls still require #485                                          |
| Nested component                      | Child has its own positional sequence and lifetime                                     | Child may use either model and owns its own lifetime                                                   |
| Keyed remount                         | New key creates a new component and fresh cells                                        | New key creates a new setup and fresh cells                                                            |

## Decision and bounded proof

Choose a **setup once, render many** component shape for the non-positional
user model. Setup creates state, derived values, watchers, and async resources
once per component lifetime. It returns a render callback that receives current
props and may use ordinary JavaScript branches and loops without changing an
owner's lifecycle declarations. The proof stores that callback by component
instance and rejects lifecycle calls inside it. The implementation remains
internal until the gates below pass.

The prototype test covers state updates across an early return and changing
loop length, fresh render props, keyed remount, a failed update retaining its
committed DOM and setup state, SSR output, hydration adoption, resource
publication, and resource abort on cleanup. A setup callback can read later
props through its third `currentProps` accessor: derived values and watches
track it, rollback restores its prior value, and hydration retains the server
node after a prop update. A setup-owned resource can use the accessor and an
owned watch to refresh on prop changes and abort an older request. This is an
internal proof, not the final source-driven async API for #492. Existing
positional callers stay on their current path. The prototype still cannot use
eager `For`/`Show`/`Case` inside its render callback yet:
those primitives still claim parent slots. A branch that creates a lifecycle
value in setup responds only to **initial** props; later changes need a keyed
child or a separately owned branch.

We reject retaining positional reruns as the sole model: they preserve existing
behavior but leave the stated ordinary-control-flow goal unmet. We reject
caching one JSX tree from setup: async `resource()` publication can leave a
plain snapshot rendered as `pending`. We also defer named-hook/keyed-slot APIs:
they add identity and collision rules to every declaration while the
lifetime-owned setup boundary provides a smaller first experiment.

## Performance evidence and budget

The unchanged `develop` baseline at `bd95fed` measured 100 coalesced writes
at 0.487 ms, `Show`/`Case` toggles at 0.021/0.024 ms, 1,000 nested component
mount and cleanup at 9.06 ms, stable 1,000-row updates at 0.423 ms, and a
keyed distant swap at 0.979 ms. The 1,000-row hydration sample was 211.6 ms
with 19.7% relative margin of error; another run on the same code was 63.7 ms.
These single samples are context, not acceptance measurements.

The paired tier 2 fixture mounts and cleans 100 stateful keyed rows, updates
their parent, and reorders their keys. After adding `currentProps`, the last
three production-mode same-runner captures on September 26 measured
legacy/setup means (ms): mount and cleanup 1.871/1.817, 1.870/1.861,
1.859/1.831; parent update 1.793/1.789, 1.848/1.835, 1.789/1.793; reorder
1.864/1.874, 1.891/1.933, 1.844/1.876. All variants stayed within the 5%
stable guardrail in those three pairs, with relative margins of error below
5.5%. One earlier mount/cleanup capture measured 1.930/2.197 ms (+13.8%),
so repeat qualification when measuring allocations and teardown separately.
The fixture measures end-to-end time only. Qualify SSR, hydration, and touched
tier 1 list guardrails independently before a public rollout.

## Consumers and migration

| Repository      | Affected surface                                                                                                 | Path                                                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `askr`          | Positional state, derive, selector, watch, resource, lifecycle calls; eager JSX controls; SSR keys and hydration | Keep current API and tests; introduce a separate opt-in public setup API only after gates pass. #485 supplies lazy controls, #492 settles async ownership and keys. |
| `askr-ui`       | Stateful component and composite internals, virtual list/table, resource-using avatar and toast                  | No mass conversion. Pilot one small leaf component, then a component with async work and one list; compare behavior and perf.                                       |
| `askr-cli`      | Templates use positional state/resource; analyzer advises stable hook order and unconditional controls           | Keep existing guidance for legacy components. Add model-specific rules and a new template only when the setup API is public.                                        |
| `askr-server`   | Server and MCP `resource` methods are separate from the UI primitive                                             | No direct component migration; verify SSR/preload compatibility before changing runtime keys.                                                                       |
| `askr-examples` | SPA, SSR, SSG, and API SSR examples exercise state, derive, resource, and controls                               | Keep current examples runnable; add a small setup example after API publication and smoke all four rendering modes.                                                 |

This is an additive path within the current `0.3.x` line while the existing
API stays supported. No deprecation is scheduled. Deprecation can be proposed
only after a public setup API, lazy control boundaries, async ownership,
SSR/hydration and sibling smoke tests, and qualified performance all pass.
If any gate fails, retain the positional API and the internal prototype as
research; no sibling migration or release is required. If published later,
legacy components remain the escape hatch until an explicit major-version
decision with a tested migration guide.

## Implementation gate

Proceed with #485's lazy control boundary design and #492's source-driven
async ownership design against both component models. Do not start a broad
runtime or sibling rewrite. Public setup API work requires: live-prop and
context semantics, conditional child cleanup, async refresh and rollback,
SSR/hydration identity, no eager parent hook claims, qualified performance,
and green existing compatibility tests. Reassess this decision at that gate.
