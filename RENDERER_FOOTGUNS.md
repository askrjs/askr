# Renderer Footguns — Triage

Concise, triage-ready list of risky patterns and recommended remediation for the DOM renderer.

## High

- **Broken instance backref on non-Element returns**
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts#L236-L243)
  - Symptom: component `__ASKR_INSTANCE` is attached to a detached host when a component returns non-Element nodes, but the runtime inserts the original returned node(s), leaving the instance backref off the inserted DOM.
  - Risk: component cleanup / `abort()` won't run on unmount → leaked cleanup functions, state, and listeners.
  - Fix: ensure `mountInstanceInline(instance, host)` is applied to the actual node inserted into the DOM. If wrapping in a host is necessary, return that host node (or otherwise attach the instance backref to the final inserted Element).

- **Listeners not consistently removed before atomic `replaceChildren`**
  - Files: [src/renderer/fastpath.ts](src/renderer/fastpath.ts#L60-L100), [src/renderer/reconcile.ts](src/renderer/reconcile.ts#L440-L480)
  - Symptom: bulk/fast-path commits call `replaceChildren` without guaranteeing `removeElementListeners`/`removeAllListeners` ran for nodes being removed.
  - Risk: lingering DOM listeners or unexpected behavior during teardown; harder-to-reproduce leaks in non-GC hosts.
  - Fix: call `removeElementListeners` (and per-subtree `removeAllListeners`) or remove listeners during `cleanupInstanceIfPresent` prior to element removal/replace.

## Medium

- **Rethrowing errors via `setTimeout` in event/microtask flush**
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts#L36-L60)
  - Symptom: errors encountered while flushing tasks are rethrown using `setTimeout(() => { throw err; })`.
  - Risk: lost synchronous stack, awkward test harness semantics, and non-deterministic error capture.
  - Fix: prefer `queueMicrotask(() => { throw err; })` or surface errors through a runtime error hook so tests can capture them deterministically.

- **DOM-only modules assume `document`/`window` availability**
  - Files: [src/renderer/evaluate.ts](src/renderer/evaluate.ts#L1-L80), [src/renderer/dom.ts](src/renderer/dom.ts)
  - Symptom: direct `document.createElement`, comment nodes, fragments used unguarded.
  - Risk: importing these modules in SSR builds will throw at module-eval time.
  - Fix: either document that these modules must not be imported in SSR bundles or add defensive guards / a separate SSR-safe entrypoint.

## Low

- **Global diagnostic keys on `globalThis`**
  - Files: `dom.ts`, `fastpath.ts`, `reconcile.ts` (multiple locations)
  - Symptom: diagnostic counters/stats are set on `globalThis` as top-level keys (`__ASKR_LAST_FASTPATH_STATS`, `__ASKR_FASTPATH_COUNTERS`, etc.).
  - Risk: collisions with consumer code, noisy global surface in shared environments.
  - Fix: consolidate under a single `__ASKR__` namespace object or gate writes behind dev-only flags.

- **Event listeners added without options (passive/capture)**
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts), [src/renderer/evaluate.ts](src/renderer/evaluate.ts)
  - Symptom: `addEventListener` invoked without options.
  - Risk: missed performance opportunities (e.g., `passive` for touch/wheel).
  - Fix: provide optional listener options API or infer `passive` for known event types.

## Suggested immediate actions (recommended order)

1. Fix instance backref behavior (High) — prevents leaks and broken cleanup.
2. Ensure listeners are removed before `replaceChildren`/bulk commits (High).
3. Replace `setTimeout` rethrows with `queueMicrotask` or hook into an error-reporting API (Medium).
4. Add SSR guards or document DOM-only import requirements (Medium).
5. Consider namespacing global diagnostics and add optional listener options (Low).

If you want, I can open a focused PR that implements items 1 and 2 (high-priority fixes). Reply `PR` to proceed.
