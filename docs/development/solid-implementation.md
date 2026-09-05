# SOLID remediation status

Baseline: `aa45809160de0127f1548761dda8261a5baad2cb`.
The historical audit remains in `solid-audit-2026-09-05.md`; source links now
target that immutable revision so structural moves do not change its evidence.

| Finding | Implementation status                                                                                                       |
| ------- | --------------------------------------------------------------------------------------------------------------------------- |
| F01     | Workers drain before rejection; lock serialization and initiating-error regressions added.                                  |
| F02     | Explicit collisions, nested preflight, and shared-ancestor merge rollback implemented.                                      |
| F03     | Complete intrinsic preflight precedes application; unsupported shapes decline without evaluation.                           |
| F04     | Void timing contracts and public type regressions implemented.                                                              |
| F05     | Ordered ref draining and AggregateError implemented.                                                                        |
| F06     | Construction-only runtime contract corrected.                                                                               |
| F07     | Opaque DOM roles and packed-consumer delegation implemented.                                                                |
| F08     | Flat hook, execution, vnode identity, read, and diagnostic views; snapshot capture colocated with state.                    |
| F09     | Fresh/hydrated adoption and retained updates separated behind one replacement rollback protocol.                            |
| F10     | Listener and reactive-binding operations extracted; scalar operations retain their existing owner.                          |
| F11     | Query cells and fixtures share complete state builders; mutation fixtures remain separate.                                  |
| F12     | For strategies take explicit inputs and return boundary results; orchestration retains transaction capture and bookkeeping. |
| F13     | Boot and testing are stable barrels over mode-specific implementations and focused helpers.                                 |
| F14     | Lifecycle policies and portal modes separated; vnode propagation remains host independent.                                  |
| F15     | Publication/locking and parallelism extracted; filesystem checks use injected operations.                                   |
| F16     | Internal renderer helpers use current narrow capability accessors.                                                          |
| F17     | Maintained declarations split by domain; normalized signatures unchanged outside approved API changes.                      |
| F18     | SSR loader inspection moved behind router-owned resolution helper.                                                          |
| F19     | Exact governance coverage documented and dependency seams enforced.                                                         |

## Red evidence

Against the baseline, focused tests reproduced the two transaction collision
failures, SSG publication after rejection, composed-ref skipped cleanup, and
stable patch mutation on decline. The corrected public timing assertions then
failed four checks: numeric debounce/throttle/RAF results and a Promise result.
Opaque API type tests failed before the new root exports existed. Final review
also added three failing type assertions for accidentally exported private
brands; explicit root exports fixed those failures.

Independent final review reproduced direct child merges leaving shared
ancestors committable, including rollback reentry and transitive sharing.
Failure handling now invalidates all affected frames before callbacks and
drains each shared participant once. Subsequent join characterization covers
identity-set ownership, sibling joins, reentrant merges, and mutable keys;
35 focused coordinator tests pass.

The broader DOM suite exposed an intentional duplicate subtree-retirement
participant; its explicit keep-first policy restored the affected lifecycle
and resource regressions (31 focused cases passed).

The initial hosted performance comparison is rejected: 16 of 93 workloads
exceed 5%, and three workloads fail sample quality in at least one capture.
All metrics remain in `../benchmarks/solid-initial-0513b15.json`. Isolated
recaptures and stronger sample collection qualify all but the selected JSX
resize workload, rejected at +5.87%. The declared control capture then used
two baseline series and the lower median. All nine captures met quality rules,
but the comparison failed at +8.96%; the full result is retained in
`../benchmarks/solid-control-rejected-58544e7.json`.

Profiling that exact workload found 10,004 registrations per resize toggle,
with a large child transaction joining a parent containing one participant.
Complete collision preflight remains necessary, but callback-free joins now
transfer membership without a second registration pass and reuse the child's
identity set. Diagnostic allocation sampling confirms removal of about 160 KiB
per toggle from the join, with unchanged registration and DOM snapshot counts.
Merges and changed key/kind indexes retain dynamic traversal and their existing
rollback ownership. The index-consistency scan avoids temporary entry-pair
allocations. Additional key-map adoption was profiled and discarded because it
showed no clear further allocation benefit. These
diagnostics do not replace qualification; final acceptance and merge remain
pending a new comparison of the optimized runtime.

The next controlled comparison at `0086048` remains rejected. Eleven of fourteen
runtime comparisons pass; selected and unselected JSX resize exceed 5%, and one
keyed-reorder control capture exceeds the RME limit. A separate comparison against
the pre-optimization source measures only a 2.47% gain. All 135 captures and
their provenance remain in `../benchmarks/solid-transfer-rejected-0086048.json`.
Hosted correctness checks pass on all three operating systems and browsers;
performance acceptance still prevents merge.

The next comparison increases the minimum sample count to 1,000 for the two
resize workloads and the keyed-reorder workload with the RME failure. Original
measurement times, operation counts, labels, and reset behavior remain unchanged;
the shared harness applies the same collection options to every source revision.
The 5% limit and all sample-quality rules remain unchanged.

Further transfer work merges smaller kind indexes into larger indexes and moves
resource-map ownership when the child holds the larger allocation. Parent
collision owners and earlier resource values remain authoritative. These maps
are internal to commit coordination; retained-element rollback captures snapshot
values rather than retaining map aliases. Added characterization covers both
key-mutation directions, kind changes, sibling joins, resource conflicts, child
release, and rollback order before and after the change.
Allocation profiling of the revised transfer reports about 1,072 KiB per toggle
owned by commit coordination, versus 1,645 KiB before transfer tuning. Join
`Map.set` and `Set.add` allocations are absent from the sampled profile. This
allocation result is diagnostic evidence; timing qualification remains pending.

The `eb70e7d` timing comparison is also rejected. All 135 captures meet sample
quality and thirteen of fourteen original-main comparisons meet the regression
limit. Selected resize fails at +12.60%; the separate pre-optimization comparison
shows +5.23% rather than an improvement. Raising the minimum to 1,000 samples did
not stabilize the bidirectional medians: selected-resize candidate medians range
from 65.85 to 74.20 ms while its means range from 57.24 to 58.08 ms. These means
do not replace the required median gate. Complete captures and median-spread
analysis remain in `../benchmarks/solid-map-transfer-rejected-eb70e7d.json`.

The next profile identified retained-element snapshot collection as a substantial
allocation and CPU cost. Capture now copies live DOM collections with indexed
loops and binding maps with `forEach`, preserving field order and the existing
entry clones. Five characterization cases pass before and after the change:
full and binding-only restoration, listener/ref/reactive identity, child and
attribute order, late text capture after form-control getters, and live attribute
addition/removal during capture. Independent review found no capture or rollback
contract changes. A fresh same-host diagnostic pair reports snapshot CPU at
3.80 versus 1.94 ms per toggle, aggregate profiled CPU down 9.69%, and snapshot
allocation down 19.0%, with identical snapshot counts. This optimization still
requires hosted timing qualification.

## Governance coverage

Subsystem value-cycle governance covers boot, common, data, renderer, router,
runtime, SSG, and SSR. Module value-cycle governance rejects cycles involving
runtime or renderer. Type-only edges are parsed and classified but are not
universally required to form an acyclic graph. Compatibility, foundations,
actions, effects, testing, and JSX are not all members of the subsystem graph.
Existing compatibility, declaration, and entrypoint rules still apply.

New checks keep vnode context propagation independent of DOM capabilities,
publication infrastructure independent of routing/rendering, and runtime/renderer
helpers on narrow renderer accessors. The dynamic-import classification fixture
now follows hydration's implementation module after its move out of the barrel.

## Verification notes

The packed root-only DOM test exposed missing native DOM initialization after
bundling. The factory now explicitly ensures native DOM delegation without
installing the runtime host. Packed tests then passed: 10 files, 20 cases.

Local browser setup initially failed because Playwright's Node downloader timed
out. The same official artifact URLs are reachable with curl; browser validation
uses those exact versions rather than substituting another installed browser.

Final local validation after review: formatting, lint/typecheck, build, 294 unit
tests, 58 repository checks, 1,569 DOM tests, 53 tests each in Chromium, Firefox,
and WebKit, public type tests, and 20 installed-consumer tests pass. Package
lint and artifact checks pass, followed by a normal build. Independent structural
review confirmed all 222 original declaration nodes, core exports, snapshot fields,
and query transitions are preserved outside the approved contract corrections.
