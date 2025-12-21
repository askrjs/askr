# FOOTGUNS

A concise, prioritized catalog of known risky or fragile patterns found in the codebase (scanned from `src/`). Each entry describes the problem, why it's risky, and a pragmatic recommendation or quick PR idea.

---

## How to use this document ✅
- Read the *Problem* and *Why it matters* sections to understand the risk.
- Use *Quick fixes* for small PRs or *Recommended mitigation* for larger design changes.
- Add tests before/after making changes to assert behavior and avoid regressions.

---

## Table of contents
1. Global mutation during SSR (Math/Date) 🔧
2. DOM snapshot rollback via `innerHTML` (expensive & lossy) ⚠️
3. Redefining `innerHTML` on mount (prototype/property hacks) ⚠️
4. Widespread `as unknown as` / unsafe casts 🧯
5. Dev-only global overrides (scheduler guards) ⚠️
6. Swallowed/hidden errors during cleanup 🟨
7. Costly traversal on cleanup (querySelectorAll) 🟨

---

## 1) Global mutation during SSR (Math/Date) 🔧
**Files:** `src/ssr/index.ts` (executeComponentSync)

Problem:
```
// dev-only: override Math.random and Date.now to throw during SSR render
(Math as unknown as { random: () => number }).random = () => { throw new Error(...); }
(Date as unknown as { now: () => number }).now = () => { throw new Error(...); }
// restored in finally
```
Why it matters:
- Mutating globals is fragile and can race when multiple SSR renders run concurrently (tests, worker pools, nested renders).
- Even dev-only changes can cause flakey tests or obscure causes of failures.

Recommended mitigation:
- Avoid global mutation. Provide deterministic RNG/time in `ctx` (already present) and make it the only supported source during SSR.
- If you need runtime detection, implement a re-entrant/stacked guard or add a lint rule that flags direct uses of `Math.random`/`Date.now` inside SSR components.

Quick fixes / PR:
- Add unit tests that run two SSR renders concurrently in dev and assert neither leaks the guard.
- Replace the temporary global override with a re-entrant guard (counter) if immediate runtime detection is required.

---

## 2) DOM snapshot rollback via `innerHTML` (expensive & lossy) ⚠️
**Files:** `src/runtime/component.ts` (runComponent uses `const domSnapshot = instance.target ? instance.target.innerHTML : '';`)

Problem:
- On render error the code restores `instance.target.innerHTML = domSnapshot` to rollback.
Why it matters:
- `innerHTML` restoration discards listeners, expando properties, and instance backrefs (like `__ASKR_INSTANCE`), possibly leaving runtime inconsistent.
- Heavy for large DOMs; may hide hard-to-debug bugs.

Recommended mitigation:
- Prefer staging (document fragment or virtual patch) so DOM mutations are committed only after render success.
- If snapshot fallback remains, document limitations and add tests verifying listener/instance integrity after rollback.

Quick fixes / PR:
- Add tests showing a component that attaches listeners or sets instance-expando and that a failing render restores expected state (decide expected behavior and codify it).
- Consider moving to transactional commit: build DOM in-memory and swap on success.

---

## 3) Redefining `innerHTML` on mount — fragile property hooks ⚠️
**Files:** `src/app/createApp.ts` (attachCleanupForRoot uses `Object.defineProperty(rootElement, 'innerHTML', ...)`)

Problem:
- Intercepting `innerHTML` setter on a host element to detect removal is a brittle approach and may fail across environments.

Why it matters:
- Re-defining DOM properties may break other scripts or cross-browser behavior and is intrusive.

Recommended mitigation:
- Prefer an explicit `cleanup()` API on an app instance or a well-documented symbol-based API rather than hooking DOM setters.
- If interception is necessary keep `try/catch` and add comprehensive tests.

Quick fixes / PR:
- Add documentation and tests that assert the fallback behavior when `Object.defineProperty` is unsupported.

---

## 4) Widespread `as unknown as` / unsafe casts 🧯
**Files/Examples:**
- `src/stdlib/fx.ts`: `as unknown as number` for timer ids
- Various places: `as unknown as EventListener` noops, `_owner` attachment via cast

Problem:
- Double-casts silence the compiler and hide cross-platform type differences (browser vs Node timers) or subtle API mismatches.

Why it matters:
- Hides real typing issues and makes future refactors and portability harder.

Recommended mitigation:
- Use proper platform-safe types: `ReturnType<typeof setTimeout>` or `number | NodeJS.Timeout` aliases.
- Replace no-op double-casts with explicit typed no-op objects or small helpers that satisfy the type safely.

Quick fixes / PR:
- Replace `as unknown as number` timer casts with a shared `type TimerId = ReturnType<typeof setTimeout> | null` and update usages.
- Replace noop double-casts with explicit no-op implementations:
```ts
const noop: EventListener & { cancel(): void } = Object.assign(() => {}, { cancel() {} });
```

---

## 5) Dev-only global overrides in scheduler (`queueMicrotask`/`setTimeout`) ⚠️
**Files:** `src/runtime/scheduler.ts` (`runWithSyncProgress` temporarily replaces `queueMicrotask` and `setTimeout` to throw in dev)

Problem:
- Mutating global scheduling functions for dev checks is a strong invariant that could break third-party code and tests.

Why it matters:
- Tests or libs that schedule microtasks during tests may get thrown errors in dev; it's a helpful guard but needs to be re-entrant safe and well-documented.

Recommendation:
- Keep invariants but ensure reentrancy safety and restore even when nested calls happen. Add clear comments and tests.

---

## 6) Swallowed/hidden errors during cleanup and traversal 🟨
**Files:** `src/renderer/dom.ts` (multiple `try/catch { void e; }` usages) and other cleanup loops

Problem:
- Errors are swallowed silently in many cleanup loops.

Why it matters:
- While defensive, silent swallowing may hide bugs and make test failures harder to diagnose.

Recommendation:
- Log dev-only diagnostics or add an opt-in debug mode that surfaces such errors during tests.
- Add targeted tests to assert that cleanup errors don't leave the system in an inconsistent state but are at least visible during development.

---

## 7) Costly traversal on cleanup: `querySelectorAll('*')` 🟨
**Files:** `src/renderer/dom.ts` (`cleanupInstanceIfPresent` uses `querySelectorAll('*')` to find nested instances)

Problem:
- Full descendant traversal is expensive on complex DOM trees.

Why it matters:
- This can slow down unmounting or cleanup operations, particularly in large apps.

Recommendation:
- Maintain an explicit registry/WeakMap of instances to avoid full traversal, or scope the traversal to known subtrees.

---

## Quick wins (PR ideas) ⚡
- Replace double-cast timer ids with `ReturnType<typeof setTimeout>` alias (small, safe change)
- Replace `as unknown as` no-op event listeners with explicit typed no-op objects
- Add unit tests for SSR global override to ensure no leakage/concurrency issues
- Add tests asserting rollback behavior around listeners/instance refs

---

## Testing suggestions 🧪
- Add concurrent SSR tests in dev mode to ensure global guards do not leak across renders.
- Add DOM rollback tests: components that attach listeners and throw during render; assert expected cleanup or behavior.
- Add tests verifying `createApp` cleanup behavior when `innerHTML = ''` is set or when `Object.defineProperty` fails.

---

## Follow-ups / Roadmap
- Short-term (low risk): timer typing, no-op cast cleanup, add missing tests
- Medium-term: replace `innerHTML` rollback with transactional commit or document fragment approach
- Long-term: lint rules for forbidden SSR global usages and a short doc page describing SSR invariants

---

If you'd like, I can implement the small PRs (timer typing + no-op cast replacements) first and add tests for them. Just say which quick win to start with.
