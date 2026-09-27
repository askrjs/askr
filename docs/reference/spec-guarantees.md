# Behavioral Contracts

Each runtime guarantee below links to the documentation that states it and the
tests that enforce it. Tests are the executable source of truth; a check in
`tests/checks/docs/spec-guarantees.test.ts` fails when a linked document,
section, or test file disappears.

## Runtime guarantees

| Guarantee                                                                                                          | Documented in                                                                                     | Enforced by                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| State writes are visible immediately, and writes in one handler coalesce into one render                           | [State writes and handlers](../concepts/determinism.md#state-writes-and-handlers)                 | [state-batching](../../tests/jsdom/state/state-batching.test.tsx)                                                                                                        |
| Queued work flushes in a fixed lane order, preserving insertion order                                              | [Queued work](../concepts/determinism.md#queued-work)                                             | [scheduler (unit)](../../tests/unit/core/scheduler.test.ts), [scheduler (jsdom)](../../tests/jsdom/runtime/scheduler.test.tsx)                                           |
| A failed render or commit restores the last committed DOM                                                          | [Failed renders](../concepts/determinism.md#failed-renders)                                       | [commit-rollback](../../tests/jsdom/runtime/commit-rollback.test.tsx), [evaluation-transactions](../../tests/jsdom/runtime/evaluation-transactions.test.tsx)             |
| Hooks run in the same order every render; a changed hook sequence (conditional or variable-count `state()`) throws | [Render-scoped hook order](../concepts/runtime-enforcement.md#render-scoped-hook-order)           | [hook-order-enforcement](../../tests/jsdom/state/hook-order-enforcement.test.tsx), [conditional-state-errors](../../tests/jsdom/state/conditional-state-errors.test.tsx) |
| Writing state during render throws                                                                                 | [Render mutations](../concepts/runtime-enforcement.md#render-mutations)                           | [state-mutation-guards](../../tests/jsdom/state/state-mutation-guards.test.tsx)                                                                                          |
| Writing state from a `derive()` or `selector()` computation throws                                                 | [Derived computation mutations](../concepts/runtime-enforcement.md#derived-computation-mutations) | [derived-write-guard](../../tests/jsdom/state/derived-write-guard.test.tsx)                                                                                              |
| Component-owned async work is aborted when its component unmounts or is replaced                                   | [Cancellation](../core/data.md#cancellation)                                                      | [cancellation](../../tests/jsdom/runtime/cancellation.test.tsx)                                                                                                          |

## Reading order

1. [Determinism](../concepts/determinism.md)
2. [Runtime Enforcement](../concepts/runtime-enforcement.md)
3. [Testing Guide](../contributing/testing.md)
4. [Test Suite README](../../tests/README.md)
