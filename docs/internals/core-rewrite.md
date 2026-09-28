# Core rewrite: the runtime Askr set out to be

Status: **core migration shipped; architecture audit and remediation in
progress**. The old runtime and renderer have been replaced by `src/core`.
This page records the shipped architecture and its current qualification
boundaries; it is no longer a migration checklist. The public API and its
documented behavior remain the compatibility contract.

## Why

The public model is small: getter-based `state()`, components that re-render
when what they read changes, function props and children that update in
place, keyed lists, error boundaries, and one component tree that renders to
the DOM, to an HTML string, and hydrates. The implementation grew to about
37k lines in `src/runtime` and `src/renderer` because each fix hardened a
design that fought that model:

- Rendering mutates live DOM, then undoes it on failure. Rollback touches
  about fifty modules (retained elements, restoration snapshots, decline
  paths, bulk-commit probes, transaction participants).
- Reactivity has four subscriber kinds (derived values, reactive props,
  fine-grained effects, component readers with render tokens), each with its
  own notification rules.
- The runtime and the renderer keep separate ownership graphs; hydration and
  portal bugs live where they meet.
- `For`, `Show`, and `Case` run eagerly inside the parent render and claim the
  parent's hook slots (#485), which needs its own scheduling and stale-row
  machinery.
- Keyed lists have several parallel implementations and fast paths.

## The core

Seven rules. Every internal module has to fit one of them.

1. **One reactive graph.** Sources (`state()`, readable cells) and
   computations (`derive()`, `selector()`, bindings, component renders,
   `watch()`). A computation records the sources it read in its last run. A
   write marks observers stale and schedules them; derived values recompute
   when read. There is one subscriber kind.
2. **One owner tree.** A root, component, control boundary, list row, or
   binding is an owner with a parent, children, cleanups, and context.
   Disposal runs children first and always finishes, collecting failures.
   The DOM range an owner produced is a field on that owner, not a separate
   renderer index.
3. **Render, then commit.** Rendering runs components, diffs their output
   against the previous output, and builds new DOM nodes off-document. It
   records operations on live DOM but performs none. Commit applies the
   operations, installs dependencies, attaches refs, and then runs lifecycle
   (`task()`, `watch()`, `resource()` starts). A render that throws is
   discarded; nothing was applied, so nothing is rolled back. An
   `ErrorBoundary` catches during render and renders its fallback instead.
   The public promise stays: a failed render leaves the last committed DOM.
   Each scheduled render (a component, a function child, a list row that read
   state directly) is its own pass. A failure discards only that pass; other
   readers updated in the same flush commit on their own, as
   [fine-grained bindings](../core/rendering.md#fine-grained-bindings-and-rollback)
   describe.
4. **Controls are components.** `Show`, `Case`/`Match`, and `For` are ordinary
   lazy element types that own their lifetimes. They never claim parent hook
   slots, so they work under `if`, ternaries, early returns, and loops.
5. **One keyed reconciler.** Children are diffed by key (or position when
   unkeyed) with a single longest-increasing-subsequence move pass. Fast paths
   are added only when a benchmark shows a regression against the current
   core.
6. **Hydration is rendering with a cursor.** The render phase claims existing
   server nodes instead of creating new ones. A mismatch falls back to
   creating nodes for that subtree.
7. **SSR runs the same component execution** with a string sink instead of a
   DOM.

## Modules and ownership

`src/core` is layered; each layer imports only from the layers listed for it,
and `tests/checks/core-architecture.test.ts` enforces this and the absence of
import cycles. The core imports nothing outside `src/common`.

| Layer       | Owns                                                                                                                 | May import                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `reactive`  | The owner tree (lifetimes), the reactive graph, and the scheduler                                                    | nothing                         |
| `component` | Component instances, positional hooks, and whether a render is executing                                             | `reactive`                      |
| `view`      | What a render result means: child descriptors shared by the DOM and SSR renderers                                    | nothing                         |
| `dom`       | The rendered tree (DOM position), render passes, reconciliation, props, events, roots, updates                       | the three above                 |
| `api`       | Public primitives: `state()`, `derive()`, `selector()`, controls, scopes, portals, lifecycle hooks, and the hook kit | `reactive`, `component`, `view` |

Within `dom`, each module has one job: `tree` (node model and DOM position
queries), `pass` (provisional work: commit or discard), `reconcile` (child
lists), `nodes` (creating, patching, and releasing each node kind), `props`
(which prop is a value, handler, ref, or binding, and when it is written),
`prop-values`, `dom-properties`, and `element-attributes` (how a value is
written), `events` (bubbling events delegated at app roots, one batch per
dispatch), `refs`, `teardown`, `updates` (standalone re-renders and error
routing), and `root`.

Ownership rules:

- **Lifetimes belong to the owner tree.** Whoever renders content creates its
  owners: a component instance owns its hooks, bindings, and child
  components; a function child's computation owns what it renders; a root
  owns the tree. The renderer ends a lifetime early by disposing its owner
  when content leaves; it keeps no second lifetime graph.
- **Provisional work belongs to the pass.** Only commit operations change
  live DOM or committed renderer state. A discarded pass disposes the owners
  it created and restores the few render-time values it changed (new props).
- **DOM position belongs to the rendered tree.** A component instance holds
  only a `view` pointer to its node; it never touches DOM.
- **Deep trees are walked iteratively.** DOM lookup and range position,
  context lookup, subtree release, and owner disposal avoid recursive parent
  walks so transparent component chains do not consume the JavaScript call
  stack during traversal or teardown. Direct recursive component chains also
  create and patch their hook-free wrappers in a loop, including the server
  render path used before hydration.
- **Timing belongs to the scheduler.** Nothing runs work inline except a
  pass committing its own operations.
- **Dependencies point inward.** The component layer reaches the renderer
  only through the `RenderHost` interface, and `nodes` reaches standalone
  updates only through an injected scheduler, so no layer depends on a
  concrete layer above it.

Hooks keep their positional contract (`state()` and friends claim slots by
call order in a component body). That is public API and stays.

## What is kept

The DOM prop, attribute, property, URL-guard, and event-delegation semantics
(now `src/core/dom/prop-values.ts`, `src/core/dom/events.ts`, and `src/common/*`), SSR escaping and attribute
serialization, the router, data, fx, actions, foundations, boot configuration,
and the public declarations in `src/public-contracts`. These are adapted to
the new owner and reactive APIs, not redesigned.

## The contract

Tests define the public compatibility contract:

- `tests/checks` public API and declaration snapshots, `tests/types`, and
  `tests/consumer-contracts`.
- Unit, jsdom, and browser behavior suites, including hydration, routing,
  controls, error boundaries, portals, and SSR integration.
- `npm run test:installed`, which validates public declarations and packed
  consumer fixtures from a clean installation.

Tests should prefer public behavior. A test that imports `src/core` internals
may be appropriate for an internal invariant, but it should not preserve a
retired implementation detail in place of a public contract test.

## Current status and qualification

The core migration is complete: public entry points use `src/core`, the old
`src/runtime` and `src/renderer` implementation has been retired, and
`tests/checks/core-architecture.test.ts` enforces the internal layer
boundaries. The full CI workflow runs formatting, lint and typecheck, build,
unit/check/jsdom/browser suites, public type tests, and packed-consumer
validation. Run performance benchmarks when a change affects a measured hot
path; a green functional suite does not establish a performance result.

Recent commit-rollback qualification covers provisional hydration text claims
and corrections, unrendered server attribute cleanup, ordinary adopted
attributes, reflected class/style writes, attribute-backed binding
transitions, and static or bound input value, checkbox checked, and option
selected state. Adopted root and nested child synchronization also restores
DOM order and root child state after a failed mutation. Dormant activation
restores its registry state and removed server attributes when cleanup fails.

Portal channel writes settle when the writer's render commits. This queues
the host update before the scheduler revisits portal descendants whose inputs
changed in the same flush, so removed rows are disposed before they can read
stale props.

## Open audit boundaries

The following live-DOM paths still need focused failure injection and review
before the comprehensive architecture audit is complete:

- Property-only props, custom-element properties, `dangerouslySetInnerHTML`,
  and controlled select value writes need targeted rollback qualification.

Use a focused regression for each confirmed defect, then run the full required
gates on the exact PR head. Keep open questions separate from verified
behavior, and update this list as the audit establishes or closes each
boundary. The experimental renderer-host contract was removed as a breaking
change; public rendering suites qualify the new core directly.
