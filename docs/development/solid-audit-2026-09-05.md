# SOLID audit: Askr runtime

Audited revision: `aa45809160de0127f1548761dda8261a5baad2cb`.
Date: 2026-09-05. Scope: this repository, including its public contracts,
runtime, renderer, boot, router, data, SSR/SSG, foundations, actions, JSX,
resources, effects, testing surface, and architecture checks.

The strongest problems are behavioral contracts, not the presence of classes
or large files. Five findings have executable failure evidence: SSG worker
lifetime, duplicate commit participants, stable-patch fallback, timing-wrapper
return types, and composed-ref cleanup. The public runtime isolation wording
also overstates what mounting supports. These should precede large structural
refactors.

## Method and limits

- Inventoried and parsed all 341 TypeScript/TSX source and declaration files
  under `src/`. Used dependency checks and function spans to select deeper
  reads; size alone is not treated as a violation.
- Traced the supplied claims through implementations, callers, compatibility
  adapters, public declarations, documentation, and existing tests. Extended
  the review to areas missing from the supplied audit, particularly effects,
  foundations, property binding, and SSG failure ownership.
- Ran the architecture suite: **14/14 passed**.
- Added five reproduction files containing nine cases: **eight fail against
  the audited implementation; one merge/control case passes**. These are
  proposed behavioral assertions, not fixes. The stable-patch assertion tests
  a proposed clean-decline contract; see its qualification below.
- This is a repository-wide, risk-directed audit, not a claim that every line
  received equal manual scrutiny. No new browser, benchmark, security, or
  release qualification was performed. No production source was changed.
- Existing successful CI does not cover these newly reproduced cases. The
  reproduction tests are intentionally red and remain uncommitted; the normal
  suites will include them until they are fixed or moved into a follow-up.

Priority means remediation order, not security severity. **P1** is observable
failure-lifetime risk; **P2** is a behavioral or important contract/ownership
problem; **P3** is structural debt or a bounded governance improvement.
"Confirmed" means directly established by code or a reproduction. A
"maintainability concern" does not claim an observed application defect.

## Findings

### F01: Failed SSG batches leave workers running after rejection

**P1; L/S; confirmed failure-lifetime defect.**

[write-static-files.ts:91](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssg/write-static-files.ts#L91) starts
workers whose writes and renames continue independently, then awaits fail-fast
`Promise.all` at line 116. One failed write rejects the batch while another
worker is still running. The caller can immediately remove its staging
directory at
[create-static-gen.ts:484](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssg/create-static-gen.ts#L484), and the
output lock releases when the operation settles at line 111.

The injected-filesystem reproduction blocks the second write, fails the first,
observes batch rejection, then releases the second. Its rename executes after
the rejection. Thus the promise does not own the lifetime of all work it
started. A full build can race staging cleanup; an incremental build can race
the next generation after lock release. The test proves late publication;
actual on-disk corruption was not simulated.

**Remediation:** stop taking new work after a failure and drain every started
worker before returning or throwing. Preserve the initiating error and define
whether already-started writes finish or are discarded. Keep the lock until
draining and cleanup finish. Adding a writer registry does not fix this.

**Acceptance:** block a sibling write and fail another; prove no rename occurs
after the batch settles, cleanup never races a worker, and a second generation
cannot enter early. Cover both full and incremental generation.

Reproduction:
[solid-ssg-worker-lifetime.test.ts](../../tests/unit/solid-ssg-worker-lifetime.test.ts).

### F02: Duplicate commit participants silently lose work

**P2; L/O; confirmed contract defect.**

[transaction-coordinator.ts:98](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/transaction-coordinator.ts#L98)
indexes participants by `kind` and `key`. At lines 107-109 a collision always
returns. Normal registration never calls `merge`, even if supplied. A nested
join calls the incoming participant's optional `merge` and otherwise silently
discards it. The supplied audit missed this distinction.

Current implementations use deliberate coalescing and snapshot retention;
that is not proof that every participant is safe to discard. The interface
does not distinguish re-registering the same object, keeping an initial
snapshot, and combining distinct pending work. Two reproductions demonstrate
undetected loss in direct registration and a nested join.

**Remediation:** specify collision semantics explicitly. Re-registering the
same object may be idempotent. Distinct collisions must merge or explicitly
declare an intentional keep-first policy; otherwise reject. Validate an
entire nested join before transferring participants so a late collision does
not leave partial membership in the parent. Audit rollback ownership if a
merge callback itself throws. Do not blindly call every existing `merge`
during same-frame registration: snapshot participants have different needs.

**Acceptance:** duplicate same object, distinct duplicate without merge,
explicit keep-first, nested merge, different kinds, and failed joins with
multiple participants. Existing lifecycle/read/control/portal behavior must
remain intact.

Reproduction:
[commit-coordinator.test.ts](../../tests/unit/commit-coordinator.test.ts).

### F03: The built-in stable patch can mutate before declining

**P2; L/O; confirmed partial mutation, application impact qualified.**

[stable-patch.ts:73](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/stable-patch.ts#L73) updates element
properties before checking child compatibility. Earlier text/child patches
also remain applied if a later child is incompatible. The reproduction gets
`false` while changing
`<div title="before">old<span>tail</span></div>` into
`<div title="after">new<span>tail</span></div>`.

The component branch additionally evaluates a retained component before it
knows whether the resulting tree is eligible
([stable-patch.ts:160](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/stable-patch.ts#L160)). This can
interleave execution with what looks like an eligibility probe.

The caller at
[for-commit.ts:329](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/for-commit.ts#L329) falls through to
general synchronization on `false`. There is no explicit written clean-decline
contract in `RendererDOMHost`; therefore the supplied audit's assertion that
`false` _must already mean_ no effects is too strong. Existing transactional
capture and fallback may repair the DOM. The reproduction proves mutation on
decline, not final user-visible corruption or duplicate lifecycle activation.

**Remediation:** choose and enforce one contract: pure eligibility followed by
application, or a prepared result that carries evaluated output into fallback.
Avoid re-executing a component to rediscover a result. Add atomic failure tests
before turning this into a generic strategy chain.

**Acceptance:** incompatible last child, changing properties/text, retained
component execution counts, listeners/refs, and fallback failure rollback.

Reproduction:
[solid-stable-patch.test.tsx](../../tests/jsdom/runtime/solid-stable-patch.test.tsx).

### F04: Timing wrappers are not substitutes for their declared functions

**P2; L; confirmed public type/behavior defect, additional finding.**

[timing.ts:45](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/fx/timing.ts#L45),
[timing.ts:111](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/fx/timing.ts#L111), and
[timing.ts:231](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/fx/timing.ts#L231) return `T` (with `cancel` where
applicable), but the returned wrappers return `undefined`, including leading
throttle/debounce execution. A wrapped `() => 42` is statically callable as a
number-returning function and produces `undefined`. This promise is also in
[the published FX contract](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/contracts/fx/index.d.ts#L40).

**Remediation:** preserve argument and receiver types but specify the actual
scheduled-call return type. Delayed execution cannot preserve an arbitrary
synchronous result contract. Updating only internal declarations will not
change the frozen public contract. Treat the correction as a consumer-visible
type change and document migration rather than concealing it behind a cast.

**Acceptance:** public declaration tests reject assigning deferred results to
`number` or `Promise<T>`; runtime tests preserve receiver, arguments, leading/
trailing timing, coalescing, and cancellation.

Reproduction:
[solid-timing-contracts.test.ts](../../tests/unit/solid-timing-contracts.test.ts).

### F05: Composed refs stop at a throwing callback

**P2; L; confirmed cleanup contract defect, additional finding.**

[compose-ref.ts:14](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/foundations/utilities/compose-ref.ts#L14)
documents that all refs run even if one fails. `setRef` only catches object
assignment failures; a callback exception escapes at line 33. The loop in
`composeRefs` then abandons later refs. The reproduction leaves a later object
ref at `"mounted"` after a preceding callback throws during `ref(null)`.

**Remediation:** drain refs independently, then apply an explicit error policy
(for example, aggregate callback errors after draining). Preserve the existing
readonly-object behavior deliberately. Match the runtime's sibling-cleanup
discipline instead of allowing one ref to prevent another's release.

**Acceptance:** throwing first/middle callbacks, readonly object refs,
assignment and null cleanup, deterministic callback order, and error reporting.

Reproduction:
[solid-composed-refs.test.ts](../../tests/unit/solid-composed-refs.test.ts).

### F06: Runtime construction is not mounted-runtime isolation

**P2; D; confirmed public contract/documentation mismatch.**

[access.ts:12](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/access.ts#L12) and
[transaction-access.ts:12](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/transaction-access.ts#L12) use the
default runtime. `createRuntime()` allocates another wiring record through
[compatibility/runtime.ts:26](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/runtime.ts#L26), but
mounting has no runtime selection parameter. In addition,
[runtime-state.ts:88](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/runtime-state.ts#L88) defaults to the
shared `globalScheduler`: two calls without a scheduler do not get independent
schedulers.

[core.d.ts:1060](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/contracts/core.d.ts#L1060) calls the
pairing wiring "for an app instance." Existing
[consumer tests](../../tests/consumer-contracts/runtime.test.tsx#L59) exercise
direct host calls and pass the default scheduler explicitly; they do not prove
mount isolation. Separate `DataRuntime` and `AppRenderRuntime` objects are
real, but are different abstractions from `AskrRuntime` execution isolation.

**Remediation:** initially state the exact construction-only contract in the
implementation JSDoc, published JSDoc, and runtime/compatibility docs. If
mountable runtimes are required, carry runtime ownership through roots,
scheduled callbacks, component execution, selectors, transactions, and portal
state. Merely changing the getter to a mutable "current runtime" is unsafe for
queued work.

**Acceptance:** tests distinguish default scheduler sharing, explicitly
supplied schedulers, default host replacement, direct isolated host calls, and
the supported mounting contract. A future mount-isolation implementation needs
interleaved two-root updates and disposal proving no cross-runtime work.

### F07: Renderer extension contracts expose execution bookkeeping

**P2; I/D; confirmed coupling, not a newly demonstrated renderer bug.**

[RuntimeRendererHost](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/contracts/core.d.ts#L1029)
accepts full `ComponentInstance`/`ChildScope`/readable records. The reachable
component contract at line 821 includes hook, ownership-generation, render
tracking, and portal ancestry fields. A delegating host can forward an owner
without understanding every field, so it is inaccurate to say every host
author must understand all of them. Nevertheless those fields are a published
compatibility obligation.

[compatibility/renderer.ts:32](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/renderer.ts#L32) also
supplies built-in DOM ownership/application operations alongside custom host
methods. This is a DOM-host extension seam, not an arbitrary platform renderer
interface. The published contract itself uses DOM types, so non-DOM rendering
is not a promised feature.

**Remediation:** define a smaller future host contract with opaque owner
identity and explicit capabilities; retain the old adapter. Do not delete
reachable legacy fields under the guise of an internal refactor. Verify native
and custom-host fallback semantics before exposing another extension layer.

### F08: Component state has several owners but one mutable record

**P2; S/I; confirmed maintainability concern.**

[component-internal.ts:79](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/component-internal.ts#L79) mixes
execution identity, hook slots, renderer identity, read tracking, app context,
portal ancestry, and diagnostics. Ownership has already been extracted into
`OwnershipRecord`; the supplied audit understates that improvement.

Generation rollback still enumerates an overlapping field set at
[component-generation.ts:54](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/component-generation.ts#L54),
while inline rollback maintains another at
[inline-render-snapshot.ts:7](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/inline-render-snapshot.ts#L7).
The concrete risk is a new field being mutated in one path but omitted from
another restoration path. This audit does not establish an omitted field that
currently corrupts a generation.

**Remediation:** identify state ownership and snapshot obligations first.
Introduce cohesive views/capabilities for hooks, render tracking, host identity,
and ancestry, and place capture/restore beside the owning state. Type-only
interfaces extending one another are a useful boundary step, not full
encapsulation. Do not allocate nested bags on every hot-path call merely to
make the object appear smaller.

**Acceptance:** failed route replacement and nested inline render restore each
slice, including subscriptions, keys, pending operations, ancestry and host
identity; retained public callback identities stay unchanged. Benchmark before
and after runtime layout changes.

### F09: Component host synchronization combines separate decisions

**P2; S; confirmed maintainability concern.**

[syncComponentElement](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/component-host.ts#L82) is 478 lines
at this revision. It selects existing owners, adopts hydration ranges,
constructs provisional components, restores failures, propagates context and
keys, and dispatches result shapes. There are already focused creation,
replacement, cleanup, range, and nested-result helpers; this is not one wholly
unfactored renderer.

**Remediation:** split fresh/hydration adoption from retained-owner updating,
with explicit prepared state and one rollback owner. Reduce repeated result
classification after those ownership seams are clear. Preserve hydration
cursor and empty/fragment/comment-host behavior.

### F10: Property binding is another major concentration of responsibilities

**P2; S; confirmed maintainability concern, additional finding.**

[syncElementPropBindings](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/prop-bindings.ts#L484) is 353
lines. It coordinates reactive scalar bindings, direct/delegated event
replacement, removal, dangerous HTML, and stale attributes. Listener teardown
logic is repeated in multiple branches. Event policy and reactive binding
lifetime can change independently.

**Remediation:** separate listener reconciliation from reactive-prop
reconciliation and scalar removal, retaining one ordered orchestration layer.
Use the existing listener-entry abstractions rather than a universal prop
plugin mechanism. Check capture, delegation changes, hydration listener
transactions, cleanup and failure restoration.

### F11: Query transitions allow contradictory combinations by construction

**P2; S; confirmed invariant-ownership concern, no contradictory live state reproduced.**

[query-cell.ts:364](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/data/query-cell.ts#L364) accepts
`Partial<QueryState<T>>` and merges it into the previous state. Nine call sites
independently set combinations of `loading`, `refreshing`, `stale`,
`consistency`, `error`, and `staleReason`, in addition to initial state
construction. The risk is forgotten flags during future transitions, not the
closed consistency union itself.

**Remediation:** centralize semantic transitions or canonical state builders
and test the permitted state combinations. Avoid forcing query and mutation
commands into a single interface: refresh records failures in query state,
while mutation execution rejects, as their separate contracts permit.

### F12: For planning and committing remain large state machines

**P3; S; confirmed complexity concern, not size-based proof of SRP violation.**

[reconcileForItems](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/for-reconcile.ts#L76) is 685 lines;
[commitForStateBoundaryChildrenImpl](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/renderer/for-commit.ts#L122)
is 667. Both own related phases of one keyed-list protocol, with specialized
append/insert/truncate/reorder paths. They already delegate range, removal,
scope, and benchmark work.

**Remediation:** make strategy inputs/results and mutation ownership explicit,
then extract independent strategy bodies where that reduces shared mutable
closure state. Keep planning and DOM application separate. Retain keyed
identity, failure rollback, and operation-count/performance evidence. A generic
registry is neither necessary nor automatically faster.

### F13: Boot and testing entry modules contain independent implementations

**P3; S; confirmed cohesion concern.**

[boot/index.ts:76](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/boot/index.ts#L76) implements islands, SPA
startup, and SPA hydration rather than only composing exports. The functions
share route/root helpers but have distinct validation and hydration behavior.
[testing/index.ts:27](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/testing/index.ts#L27) implements DOM events,
query/mutation fixtures, invalidation recording, and route warnings.

**Remediation:** turn these into stable barrels over island/SPA/hydration and
event/fixture/invalidation/route modules. Keep symbol identity, side-effect
initialization order and public declaration reachability unchanged. Update the
architecture test's hard-coded boot-to-SSR dynamic-import location if that
implementation moves; preserve the dependency check rather than deleting it.

### F14: Lifecycle, portal, and context have separable policy areas

**P3; S; confirmed cohesion concern with qualifications.**

[lifecycle-operations.ts:1](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/lifecycle-operations.ts#L1)
contains listener, timer, task and watch policy. They do share lifecycle slot,
commit and ownership mechanisms; "no shared logic" overstates the original
claim. [portal.ts:79](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/portal.ts#L79), line 181, and line 472
combine request-local portal output, explicit portals, and implicit default
portal coordination. [context.ts:214](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/context.ts#L214) and
line 312 implement vnode propagation/rebasing alongside lexical frame access.

**Remediation:** extract policy-specific implementations behind the same
lifecycle registration path. Keep one portal lifetime protocol. Move vnode
context propagation into a host-independent context module, not automatically
into the DOM renderer: SSR and execution also need it, and runtime must not
gain a renderer dependency.

### F15: SSG orchestration also owns publication infrastructure

**P3; S/D; confirmed cohesion concern, separate from F01.**

[create-static-gen.ts:54](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssg/create-static-gen.ts#L54) detects CPU
parallelism, line 88 serializes output operations, line 160 replaces output
directories, and line 212 constructs the generator. These concerns have
different failure and testing needs from route selection/rendering.

There is already a filesystem seam in `replaceOutputDirectory`, and
[writeStaticFiles](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssg/write-static-files.ts#L26) accepts injected
operations. Its default output layout is an intentional static-site contract;
lack of an output-format registry is not independently an OCP violation.

**Remediation:** extract output publication/locking and parallelism policy
behind small internal functions. Preserve full-build rollback and incremental
behavior. The filesystem seam is incomplete: existence checks still directly
use `fsSync`; inject those too when building a coherent testable I/O boundary.

### F16: Narrow renderer capabilities are widened at the access boundary

**P3; I; confirmed opportunity, not an observed behavior defect.**

[renderer-capabilities.ts:108](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/renderer-capabilities.ts#L108)
composes five role interfaces, but
[access.ts:16](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/access.ts#L16) returns all of them.
[component-cleanup.ts:59](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/component-cleanup.ts#L59) only
needs host cleanup; reactive notification through `access.ts` needs only
`markReactivePropsDirtySource`.

**Remediation:** expose narrow typed accessors or pass role interfaces into
helpers that benefit from independent substitution. Return the current
capability view without allocating per-call wrappers or caching a stale host
across `configureRenderer`. More accessor functions alone do not eliminate the
underlying default-runtime coupling in F06.

### F17: Published declarations concentrate unrelated contracts

**P3; S; confirmed maintenance concern, not automatically ISP failure.**

[core.d.ts](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/compatibility/contracts/core.d.ts) is a 1,765-line
maintained source contract reached by router, data, resources and SSR subpath
declarations. It combines scheduler, ownership, control and integration types.
This increases coordinated-edit and compatibility-review cost.

Importing a type from one large file does not force a consumer to implement
every interface and does not itself pull all JavaScript into a bundle. The
strong ISP finding is the renderer method surface in F07, not file length.

**Remediation:** split internal source contracts by domain while preserving
public names/re-exports, documentation and reachable signatures. The existing
declaration snapshots and packed type tests should prove preservation; do not
regenerate the frozen contracts from implementation just to simplify files.

### F18: Synchronous SSR still probes router record details

**P3; D/S; confirmed coupling, no misrouting reproduced.**

[route-policy-resolution.ts:51](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssr/route-policy-resolution.ts#L51)
detects SSR loaders by searching manifest records and comparing paths plus a
cast `fallbackPrefix`. The same module performs matching and then invokes the
canonical request resolver at line 98. It reuses the router's matching
implementation, but still interprets metadata to choose the handler.

**Remediation:** expose the needed resolved handler/loader metadata from the
router resolution result. Keep redirect/deny/sync-SSR policy explicit. Test
fallback routes, loaders, auth and redirects through string and request
rendering. Do not characterize this as a completely separate router.

### F19: Architecture assertions cover less than the original description

**P3; D/O; confirmed governance scope limitation.**

[architecture.test.ts:15](../../tests/checks/architecture.test.ts#L15)
includes eight subsystems in its subsystem-cycle graph. Compatibility,
foundations, actions, effects, testing and JSX are not all part of that area
cycle assertion. The module-cycle assertion at line 239 specifically rejects
cycles involving runtime or renderer. Other explicit rules still protect
compatibility imports, published declarations and subsystem entrypoints.

The test parses type-only edges but does not universally require an acyclic
type graph. Thus "all package areas and all dependencies are acyclic" would
overstate what the passing tests establish.

**Remediation:** document exact governance coverage; add rules for additional
areas only where a deliberate dependency policy exists. Prefer domain rules
and mutation-ownership assertions to limits on file size or line count.

## Good structures to preserve

| Principle | Evidence                                                                                                                                                                                                                                                                   | Why it works                                                                                                                                                                               |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| D         | [boot/runtime-wiring.ts:5](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/boot/runtime-wiring.ts#L5), [runtime/access.ts:16](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/access.ts#L16)     | Browser composition installs a host; execution does not import the DOM renderer. The unconfigured host deliberately throws for required operations and declines/no-ops for others.         |
| S/D       | [ownership.ts:10](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/ownership.ts#L10), [component-cleanup.ts:26](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/component-cleanup.ts#L26) | Generic lifetime traversal is separated from component-specific disposal phases.                                                                                                           |
| O         | [transaction-coordinator.ts:13](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/runtime/transaction-coordinator.ts#L13)                                                                                                                   | Commit phases accept independent participants; the loop has no participant-kind switch. F02 qualifies its collision semantics.                                                             |
| O         | [router/resolution.ts:210](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/router/resolution.ts#L210)                                                                                                                                     | Policies are functions executed generically; access rules do not need new resolver branches.                                                                                               |
| S         | [router/resolution.ts:38](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/router/resolution.ts#L38)                                                                                                                                       | Route matching is re-exported from one implementation instead of copied.                                                                                                                   |
| I/L       | [ssr/render-sync.ts:329](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssr/render-sync.ts#L329)                                                                                                                                         | `write2`/`write3` are optional sink optimizations with a correct basic-`write` fallback.                                                                                                   |
| D         | [common/render-context.ts:55](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/common/render-context.ts#L55), [ssr/context.ts:50](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/ssr/context.ts#L50)     | Request context is supplied through a provider/accessor seam; Node context machinery stays outside runtime execution.                                                                      |
| O/I       | [common/default-portal-runtime.ts:17](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/common/default-portal-runtime.ts#L17)                                                                                                               | Optional portal support is installed through a small host capability.                                                                                                                      |
| S/I       | [control/for.ts:36](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/control/for.ts#L36)                                                                                                                                                   | The public keyed/indexed alternatives are explicit; the public primitive delegates execution to runtime.                                                                                   |
| S         | [foundations/structures/layer.ts:97](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/foundations/structures/layer.ts#L97)                                                                                                                 | Layer coordination owns ordering and callbacks, leaving DOM insertion and CSS to callers.                                                                                                  |
| D         | [data/data-runtime.ts:35](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/data/data-runtime.ts#L35)                                                                                                                                       | Data caches and lifetime-indexed slots are separated from the public handle. This is a real isolation seam, unlike assuming every `AskrRuntime` is mountable.                              |
| S         | [actions/runtime.ts:6](https://github.com/askrjs/askr/blob/aa45809160de0127f1548761dda8261a5baad2cb/src/actions/runtime.ts#L6)                                                                                                                                             | Action framework data is read from the owning application context. Browser fetch/location policy in the action entry is a deliberate browser integration, not by itself a SOLID violation. |

`reconcile-fastpaths.ts` is a useful ordered fallback composition, but it is
not a registry: adding a strategy still changes `tryFastPaths`. Its catch-and-
fallback behavior also needs the same mutation-safety discipline as F03.
Neither function-based programming nor class-based programming establishes
SOLID compliance on its own; the public contract exports `AskrRuntime` and
`Scheduler` classes.

## Disposition of the supplied audit

| Supplied claim                                | Result                                                                                                                                                  |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createRuntime` isolation                     | Confirmed and expanded: scheduler also defaults to the shared singleton (F06).                                                                          |
| Renderer-host inversion                       | Confirmed strength; native/legacy adapter and DOM-specific limits documented (F07).                                                                     |
| Component record and generation snapshots     | Confirmed coupling; existing lifetime extraction acknowledged (F08).                                                                                    |
| Large component-host function                 | Confirmed, with existing helper decomposition acknowledged (F09).                                                                                       |
| For state machines                            | Complexity accepted; not a violation merely because nested closures are long (F12).                                                                     |
| Boot/testing mixed concerns                   | Confirmed low-risk decomposition candidates (F13).                                                                                                      |
| Lifecycle/portal/context mixed concerns       | Confirmed with shared lifecycle logic and host-independent context qualification (F14).                                                                 |
| SSG orchestration/I/O coupling                | Confirmed; existing filesystem seams noted, actual worker-lifetime failure added (F01/F15).                                                             |
| Vnode if-chains violate OCP                   | Not established. Vnode kinds are a closed internal grammar; independent policy extraction can help SRP. A registry requires a supported extension need. |
| Query closed union violates OCP               | Reclassified as state-invariant ownership concern (F11).                                                                                                |
| SSG status switches/output layout violate OCP | Not established. Add exhaustive handling for the closed status set; do not invent output plugins without a requirement (F15).                           |
| Optional commit merge loses state             | Confirmed; same-frame and nested behavior differ (F02).                                                                                                 |
| Stable patch may violate no-effects fallback  | Built-in partial mutation reproduced, but final application corruption remains unproven (F03).                                                          |
| Query/mutation failure asymmetry              | Different command contracts, not an LSP violation without a shared substitution promise.                                                                |
| Narrow capability interfaces/fat getter       | Both confirmed, with accessor benefit bounded (F16).                                                                                                    |
| Fine-grained subpaths/shared declaration file | Packaging strength and source-cohesion debt can coexist; file sharing is not itself ISP (F17).                                                          |
| Canonical SSR/SSG routing                     | Mostly confirmed; synchronous SSR metadata probing is a remaining coupling (F18).                                                                       |
| No public classes/full acyclic graph          | Corrected; public classes exist and cycle governance has explicit scope (F19).                                                                          |

## Coverage ledger

| Area                               | Audit focus and result                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and ownership              | Transaction protocol, scheduler access, component state/capture/disposal, read tracking, lifecycle operations, context, portals, keyed reconciliation; F02/F06/F08/F12/F14/F16.              |
| Renderer                           | Component adoption/replacement, range ownership, mutation rollback, evaluation, vnode creation, property/event binding, keyed commit and stable fast paths; F03/F09/F10/F12.                 |
| Compatibility/public API           | Runtime construction, renderer translation, ownership views, frozen declarations, public entries and consumer tests; F04/F06/F07/F17.                                                        |
| Boot                               | Island/SPA/hydration entry flows, renderer wiring, app context and navigation ownership; F06/F13.                                                                                            |
| Router                             | Matching, resolution, policies, store/context fallback, navigation preparation/publication and SSR consumers; F18, otherwise useful established seams.                                       |
| Data                               | Query/mutation transitions and cleanup, runtime selection, shared notification, query-collection ownership/concurrency and fixture surface; F11/F13.                                         |
| SSR                                | Request context/provider, sink capability fallbacks, sync vnode rendering, route policy lookup and deferred-stream cancellation; F18.                                                        |
| SSG                                | Route normalization, output descriptors, worker publication, full replacement, incremental output, metadata and locks; F01/F15.                                                              |
| Foundations/components/control/JSX | Interaction and ref composition, prop merging, controlled state, collection/layer/slot policy, public For authoring and vnode cloning; F05; no additional demonstrated SOLID defect claimed. |
| Actions/resources/effects          | App framework access, browser action transport, cancellation/generation helpers, resource state/wiring and timing wrappers; F04/F14.                                                         |
| Common/testing/bench governance    | Provider bridges, role types, test utilities, architecture checks and diagnostic call sites; F13/F19. Benchmark code was inventoried, not performance-qualified.                             |

## Remediation sequence

1. **Behavior first:** fix F01, F02 and F05 with failure-lifetime tests, then
   resolve F03's decline contract and public timing types in F04. The latter
   needs an explicit compatibility decision.
2. **Tell the truth about extensions:** correct F06 docs/contracts, define
   the supported host scope in F07, and record any future mount-isolation API
   separately. Avoid widening this into a new renderer framework.
3. **Low-risk cohesion:** split boot/testing and extract SSG publication
   machinery (F13/F15). Preserve exports and initialization order.
4. **State ownership:** establish component slices and snapshot ownership
   (F08), then decompose component-host and prop bindings (F09/F10). Centralize
   query transition invariants (F11).
5. **Measured refinement:** For strategies, lifecycle/portal/context modules,
   narrow accessors, contract-file organization, SSR metadata seams and
   governance scope (F12/F14/F16-F19).

Each implementation change needs the repository's matching format, lint,
build, unit/check/jsdom/browser and type gates. Changes to hot runtime paths
also need the relevant benchmark evidence. Keep fixes separate from broad
mechanical moves so regressions have an identifiable cause.

## Reproduction commands and status

```bash
npm run test:checks -- tests/checks/architecture.test.ts
npm run test:unit -- tests/unit/commit-coordinator.test.ts
npm run test:unit -- tests/unit/solid-timing-contracts.test.ts
npm run test:unit -- tests/unit/solid-composed-refs.test.ts tests/unit/solid-ssg-worker-lifetime.test.ts
npm run test:jsdom -- tests/jsdom/runtime/solid-stable-patch.test.tsx
```

The first command passes 14 cases. The remaining commands reproduce eight
failed assertions and one passing control case against unchanged production
code. The SSG reproduction injects virtual file operations and performs no
output-directory writes. No fixes, commits, PRs, merges, or releases are part
of this audit deliverable.
