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
26 focused coordinator tests pass.

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

Final local validation after review: formatting, lint/typecheck, build, 285 unit
tests, 58 repository checks, 1,564 DOM tests, 53 Chromium tests, public type
tests, and 20 installed-consumer tests pass. Independent structural review
confirmed all 222 original declaration nodes, core exports, snapshot fields,
and query transitions are preserved outside the approved contract corrections.
