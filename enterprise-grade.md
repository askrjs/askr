Below is a **1:1 mapping** from each invariant → **exact test or bench** you need.
Names are deliberate — these become permanent fixtures.

---

## 1. Render & State

1. **Atomic commit**
   **Test:** `render_atomicity.test.ts`
   → Assert DOM never reflects partial tree during render

2. **Deterministic ordering**
   **Test:** `render_determinism.test.ts`
   → Same inputs, randomized scheduling, identical DOM snapshots

3. **Identity preservation**
   **Test:** `keyed_identity_preservation.test.ts`
   → Keys preserve element, listeners, focus, scroll

4. **No implicit re-renders**
   **Test:** `explicit_state_only.test.ts`
   → Unused state changes do not trigger render

---

## 2. Performance

5. **O(1) steady-state updates**
   **Bench:** `hotpath/caret_move.bench.ts`
   → Zero allocations, constant time

6. **Large-list safety**
   **Bench:** `reconcile/keyed_reorder_large.bench.ts`
   → 10k reverse reorder under fixed time budget

7. **Bounded reconciliation**
   **Bench:** `reconcile/worst_case_diff.bench.ts`
   → Pathological reorder stays sub-linear or capped

8. **Write-only commit**
   **Test:** `commit_no_layout_reads.test.ts`
   → Instrument `getBoundingClientRect`, assert zero calls

---

## 3. Long-Session Stability

9. **Memory monotonicity**
   **Soak Test:** `soak/8hr_memory.test.ts`
   → Heap plateaus after warmup

10. **Listener lifecycle correctness**
    **Test:** `lifecycle_listener_cleanup.test.ts`
    → No leaked listeners after unmount

11. **Deterministic teardown**
    **Test:** `editor_close_releases_resources.test.ts`
    → Close tab frees all owned state

---

## 4. Concurrency & Isolation

12. **Single-writer DOM rule**
    **Test:** `dom_single_writer.test.ts`
    → Concurrent actors never mutate DOM simultaneously

13. **Message-only interaction**
    **Test:** `actor_isolation.test.ts`
    → Shared mutable state forbidden

14. **Work preemption**
    **Bench:** `scheduler/preempt_long_render.bench.ts`
    → Large render yields without blocking input

---

## 5. Extensions

15. **Capability boundaries**
    **Test:** `extension_dom_access_denied.test.ts`
    → DOM access throws or is impossible

16. **Failure containment**
    **Test:** `extension_crash_isolated.test.ts`
    → Extension exception does not kill UI

17. **Deterministic extension ordering**
    **Test:** `extension_ordering_deterministic.test.ts`
    → Same extension set → same output

---

## 6. Tooling & Debuggability

18. **Time-travelable state**
    **Test:** `event_log_replay.test.ts`
    → Replay produces identical DOM

19. **Inspectable render graph**
    **Test:** `render_causality_graph.test.ts`
    → Each render has traceable cause

20. **Perf attribution**
    **Bench:** `commit_attribution.bench.ts`
    → Every commit tagged with source + duration

---

## 7. Portability

21. **Host-agnostic runtime**
    **Test:** `host_matrix.test.ts`
    → Browser + Electron produce identical results

22. **No microtask dependence**
    **Test:** `microtask_independence.test.ts`
    → Promise timing changes do not alter output

---

## Non-negotiable rule

If an invariant **doesn’t have a test or bench**, it **doesn’t exist**.
