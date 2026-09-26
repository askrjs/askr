# Core rewrite: the runtime Askr set out to be

Status: **in progress on `fix/broken-design`**. This record replaces the
incremental hardening plan for the runtime and renderer. The public API,
its documented behavior, and every sibling package stay unchanged; the
implementation behind them is rebuilt.

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
written), `events`, `refs`, `teardown`, `updates` (standalone re-renders and
error routing), and `root`.

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
(`src/renderer/props`, `src/common/*`), SSR escaping and attribute
serialization, the router, data, fx, actions, foundations, boot configuration,
and the public declarations in `src/public-contracts`. These are adapted to
the new owner and reactive APIs, not redesigned.

## The contract

Tests are the definition of "unchanged":

- `tests/checks` public API and declaration snapshots, `tests/types`, and
  `tests/consumer-contracts`.
- jsdom and browser tests that import only public entry points (332 of 488
  test files at the start of the rewrite).
- The askr-ui, askr-themes, and askr-examples suites run against a packed
  build of this branch.

Tests that import runtime or renderer internals pin the old implementation.
Each one is either rewritten against public behavior or deleted with the
module it tests. A deleted test whose behavior is public must have a public
replacement first.

## Order of work

1. Reactive graph and owner tree, with unit tests.
2. Component execution, DOM render/commit, keyed reconciliation, refs,
   events, context, error boundaries, and lazy controls.
3. Hydration and SSR on the same execution path.
4. Lifecycle hooks, portals, data, router, and boot integration.
5. Switch the public entry points, delete the old core and its pinned tests,
   and qualify performance against the tier 1 and tier 2 benchmarks.

Each step lands only with the contract suite green.
