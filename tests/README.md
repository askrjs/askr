# Askr Test Suite Architecture

## Philosophy

The Askr test suite isn't just about coverage—it's about **proving guarantees** from SPEC.md under realistic conditions.

### Core Principles

1. **Determinism First** - No flaky timing, explicit ordering, provable behavior
2. **Spec-Driven** - Each test validates a specific SPEC guarantee
3. **Realistic Scenarios** - Tests reflect real app patterns, not synthetic cases
4. **Performance Proof** - Stress tests validate efficiency under load
5. **DX is Product** - Error messages and dev warnings are tested

---

## Directory Structure

### `runtime/` - Execution Model Guarantees

🎯 **Most Important Category**

These tests prove the core actor model and serialization guarantees:

- **render_transactions.test.ts** - Atomic render transactions (SPEC 2.1)
  - ✅ Successful sync render commits all changes
  - 🚧 Failed render rolls back (no partial DOM)
  - Validates: all-or-nothing semantics, BUILD vs COMMIT phases

- **scheduler_ordering.test.ts** - Deterministic scheduling (SPEC 2.2)
  - Validates: FIFO task execution, coalescing, no reentrancy
  - Proves: all state writes serialize through single mailbox

- **event_happens_before.test.ts** - Event ordering (SPEC 2.3)
  - Validates: E1 → effects → E2 ordering
  - Proves: no race conditions, handlers wrapped through scheduler
  - Tests: rapid-fire events don't reorder

- **async_staleness.test.ts** - Generation tracking (SPEC 2.6)
  - Validates: generation tokens prevent stale renders
  - 🚧 Proves: latest async render always commits
  - Tests: rapid re-renders pick newest result

- **cancellation.test.ts** - AbortSignal lifecycle (SPEC 2.6)
  - 🚧 Validates: abort on unmount cancels pending work
  - Proves: signal propagates to fetch/async operations
  - Tests: stale async work doesn't commit

- **commit_rollback.test.ts** - Transaction semantics (SPEC 2.1, 2.2)
  - Validates: commit or rollback (no half-states)
  - Tests: listener attachment is commit-coupled
  - Proves: previous state restored on failure

- **failure_modes.test.ts** - Error resilience
  - Validates: one component's error doesn't corrupt others
  - Tests: scheduler max-depth guards, error isolation
  - Proves: rendering remains safe under failure

### `identity/` - Component Identity & Reconciliation

Proves component state persistence and reconciliation:

- **positional_identity.test.ts** - Implicit keying
  - Validates: positional identity when no keys provided
  - Tests: reordering without keys causes state misalignment

- **keyed_lists.test.ts** - Explicit key stability (SPEC 2.4)
  - Validates: keys survive reorder/insert/delete
  - Proves: identity follows keys through list mutations
  - Tests: state persists through all operations

- **reorder_preserves_state.test.ts** - Reorder correctness
  - Validates: moving items preserves their state
  - Tests: reverse, sort, shuffle operations
  - Proves: O(n) reconciliation works correctly

- **unmount_cleanup.test.ts** - Lifecycle cleanup
  - Validates: state resets on unmount
  - Tests: no state leaks between instances
  - Proves: garbage collection correctness

### `state/` - State Semantics & Hook Discipline

Proves state() API correctness:

- **state_persistence.test.ts** - State survives re-renders
  - Validates: state values persist across renders
  - Tests: state reuse on fast path
  - Proves: O(1) state access

- **hook_order_enforcement.test.ts** - Hook call order (SPEC 2.5)
  - 🚧 Validates: state() calls must be in same order each render
  - Tests: throws on reorder with actionable error
  - Proves: catches developer mistakes early

- **conditional_state_errors.test.ts** - Guard against conditionals
  - 🚧 Validates: state() inside if/for throws before commit
  - Tests: detailed error message showing expected vs actual
  - Proves: dev mode prevents subtle bugs

- **state_mutation_guards.test.ts** - Prevent render-time mutation
  - Validates: state.set() during render throws
  - Tests: prevents infinite loops, max-depth guard works
  - Proves: early detection of common mistakes

### `dom/` - DOM Commit Semantics

Proves minimal DOM mutation strategy:

- **minimal_mutation.test.ts** - Only necessary changes
  - Validates: unchanged subtrees untouched
  - Tests: O(changes) complexity, not O(tree)
  - Proves: performance efficiency

- **listener_lifecycle.test.ts** - Event handler attachment
  - Validates: listeners attached after COMMIT
  - Tests: rollback removes listeners
  - Proves: listener safety (SPEC 3.3)

- **no_partial_dom.test.ts** - Atomic DOM updates
  - Validates: either full tree or nothing
  - Tests: exception during creation doesn't leave orphaned nodes
  - Proves: DOM always consistent with component tree

- **text_node_updates.test.ts** - Text content changes
  - Validates: efficient text mutations
  - Tests: string/number/null handling
  - Proves: correct primitive rendering

### `ssr/` - Determinism & Hydration

Proves server-side rendering correctness:

- **ssr_determinism.test.ts** - Deterministic output
  - Validates: same input → same HTML output
  - Tests: run 100x, all identical
  - Proves: no non-determinism source

- **hydration_success.test.ts** - Successful hydration
  - Validates: client render matches server HTML
  - Tests: listeners attach after successful match
  - Proves: hydration correctness

- **hydration_mismatch.test.ts** - Mismatch handling (SPEC 4.2)
  - Validates: mismatch detected, handled gracefully
  - Tests: fallback to client render or hard error (dev)
  - Proves: safety during hydration

- **snapshot_restore.test.ts** - State snapshot restore
  - Validates: state snapshot captured and restored
  - Tests: complex state trees
  - Proves: serialization round-trip works

### `stress/` - Proof Under Load

Tests framework behavior under realistic conditions:

- **large_tree_updates.test.ts** - Scalability
  - Tests: 1000-node tree updates < 5ms (target)
  - Validates: O(changes) stays true at scale
  - Proves: performance characteristics hold

- **rapid_events.test.ts** - High-frequency input
  - Tests: 100 clicks in sequence
  - Validates: coalescing works correctly at scale
  - Proves: determinism under load

- **resource concurrency tests** - Many concurrent resource loads
  - Tests: many overlapping `resource()` invocations
  - Validates: generation tracking under load
  - Proves: latest generation wins reliably

- **mount_unmount_cycles.test.ts** - Lifecycle stress
  - Tests: 100 mount/unmount cycles
  - Validates: no leaks, clean cleanup
  - Proves: memory safety

### `dev_errors/` - Developer Experience

Proves error messages and warnings work correctly:

- **error_messages.test.ts** - Actionable errors
  - Validates: state() outside component says how to fix
  - Tests: state shape violations show expected vs actual
  - Proves: DX prevents mistakes

- **dev_warnings.test.ts** - Dev-mode guidance
  - Validates: missing keys warn in dev mode
  - Tests: stale renders explain why prevented
  - Proves: helps developers understand system

- **prod_fallbacks.test.ts** - Production resilience
  - Validates: prod mode degrades gracefully
  - Tests: errors don't crash whole app
  - Proves: safety over convenience trade-off

### `fixtures/` - Reusable Test Components

Common components used across test files:

- **components.tsx** - Basic test components
  - Simple, Stateful, Nested, WithChildren

- **async_components.tsx** - Async test components
  - SlowRender, FailingAsync, StaleDetector

- **list_components.tsx** - List test components
  - SimpleList, KeyedList, ReorderableList

- **error_components.tsx** - Error boundary patterns
  - ThrowingComponent, ErrorBoundary patterns

### `helpers/` - Test Utilities

Framework for tests (NOT framework code):

- **test_renderer.ts** - DOM setup/teardown
  - `createContainer()`, `cleanup()`
  - `renderComponent(component)`

- **fire_event.ts** - Event testing
  - `click(element)`, `input(element, value)`
  - Wraps event firing, validates firing

- **flush.ts** - Scheduler control
  - `flushScheduler()` - run all pending tasks
  - `waitForRender()` - wait for next render

- **expect_dom.ts** - DOM assertions
  - `expectText(container, text)`, `expectElement(selector)`
  - Domain-specific assertion helpers

- **inject_failure.ts** - Test failure injection
  - Mock render failure, commit failure
  - Simulate exception scenarios

---

## Running Tests

```bash
# All tests
npm test

# Specific category
npm test tests/runtime/

# Specific file
npm test tests/runtime/render_transactions.test.ts

# Watch mode
npm run dev

# UI mode
npm run test:ui
```

---

## Test Status

| Category   | Total   | Passing | Failing | Status  |
| ---------- | ------- | ------- | ------- | ------- |
| runtime    | 30      | 27      | 3       | 🚧      |
| identity   | 12      | 12      | 0       | ✅      |
| state      | 12      | 12      | 0       | ✅      |
| dom        | 8       | 8       | 0       | ✅      |
| ssr        | 12      | 4       | 8       | 🚧      |
| stress     | 8       | 8       | 0       | ✅      |
| dev_errors | 9       | 9       | 0       | ✅      |
| router     | 24      | 24      | 0       | ✅      |
| operations | 8       | 8       | 0       | ✅      |
| context    | 2       | 2       | 0       | ✅      |
| contracts  | 8       | 8       | 0       | ✅      |
| **TOTAL**  | **133** | **112** | **11**  | **84%** |

_Updated: Added new test categories, current status reflects recent fixes to state batching and binding lifecycle contracts._

---

## Adding New Tests

### 1. Identify the Guarantee

Which SPEC section does this prove?

### 2. Choose the Category

Which directory best fits?

### 3. Write Test with Clear Intent

```typescript
describe('render_transactions', () => {
  it('should ensure BUILD and COMMIT phases are separate (SPEC 2.1)', async () => {
    // Setup
    const component = () => ({ type: 'div' });

    // Act
    createApp({ root: container, component });

    // Assert
    expect(container.textContent).toBe(''); // Proves COMMIT happens after BUILD
  });
});
```

### 4. Use Fixtures

Import common components:

```typescript
import { SimpleList, KeyedList } from '../fixtures/list_components';
```

### 5. Use Helpers

```typescript
import { createContainer, fireEvent, flushScheduler } from '../helpers';

const { container, cleanup } = createContainer();
fireEvent.click(element);
await flushScheduler();
```

---

## Architecture Decisions

### Why This Structure?

1. **Category First** - Group by what you're proving, not implementation detail
2. **Runtime is Core** - Execution model gets most tests
3. **Stress Tests Separate** - Load tests don't clutter feature tests
4. **Fixtures & Helpers Clear** - Sharp boundary between test harness and tests
5. **Docs Embedded** - Each file explains its SPEC reference

### Why Not Just One File?

- 300+ tests in one file = impossible to navigate
- Tests become documentation through structure
- Easy to see what's proven vs what's not
- Enables parallel thinking: "What about X?" → "Check `stress/`"

### Why Not Mock?

- Askr's core is determinism—no mocks hide that
- Prefer real DOM, real scheduling, real async
- Mocks often test the mock, not the code
- Exceptions: injection points for failure scenarios only

---

## Guarantees Being Proven

| Guarantee                        | Category   | Files                                            | Status |
| -------------------------------- | ---------- | ------------------------------------------------ | ------ |
| atomic-render-transaction        | runtime    | render_transactions, commit_rollback             | ✅     |
| deterministic-scheduler          | runtime    | scheduler_ordering                               | ✅     |
| happens-before-events            | runtime    | event_happens_before                             | ✅     |
| keyed-reconciliation             | identity   | keyed_lists, reorder_preserves_state             | ✅     |
| hook-shape-enforcement           | state      | hook_order_enforcement, conditional_state_errors | 🚧     |
| async-staleness-and-cancellation | runtime    | async_staleness, cancellation                    | 🚧     |
| listener-resource-safety         | dom        | listener_lifecycle                               | ✅     |
| ssr-hydration-correctness        | ssr        | hydration_success, hydration_mismatch            | 🚧     |
| strict-dev-errors                | dev_errors | error_messages, dev_warnings                     | ✅     |
| safe-prod-failure                | dev_errors | prod_fallbacks                                   | ✅     |

---

## Next Steps

1. Consolidate old `/test` directory tests into this structure
2. Add missing stress tests for heavy load scenarios
3. Implement failure injection helpers
4. Add performance benchmarks
5. Create CI/CD that validates test suite matches SPEC
