# Renderer Footguns — Triage & Status

Concise, triage-ready list of risky patterns and recommended remediation for the DOM renderer. Each item includes a short status update.

## High

- **Broken instance backref on non-Element returns** — **RESOLVED** ✅
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts#L236-L243)
  - Symptom: component `__ASKR_INSTANCE` is attached to a detached host when a component returns non-Element nodes, but the runtime inserts the original returned node(s), leaving the instance backref off the inserted DOM.
  - Risk: component cleanup / `abort()` won't run on unmount → leaked cleanup functions, state, and listeners.
  - Fix & status: `createDOMNode` now ensures instances are mounted on the actual inserted Element or a host wrapper that is returned and used by the runtime. This guarantees deterministic cleanup.

- **Listeners not consistently removed before atomic `replaceChildren`** — **RESOLVED** ✅
  - Files: [src/renderer/fastpath.ts](src/renderer/fastpath.ts#L60-L100), [src/renderer/reconcile.ts](src/renderer/reconcile.ts#L440-L480)
  - Symptom: bulk/fast-path commits call `replaceChildren` without guaranteeing `removeElementListeners`/`removeAllListeners` ran for nodes being removed.
  - Risk: lingering DOM listeners or unexpected behavior during teardown; harder-to-reproduce leaks in non-GC hosts.
  - Fix & status: pre-cleanup now removes listeners and runs instance cleanup only for nodes that are being removed (preserves listeners on reused nodes). This was validated by targeted tests.

## Medium

- **Rethrowing errors via `setTimeout` in event/microtask flush** — **RESOLVED** ✅
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts#L36-L60)
  - Symptom: errors encountered while flushing tasks were rethrown using `setTimeout(() => { throw err; })`.
  - Risk: lost synchronous stack, awkward test harness semantics, and non-deterministic error capture.
  - Fix & status: `queueMicrotask` is now used to rethrow flush errors and for scheduling microtask flushes (deterministic and preserves stack for test harnesses).

- **DOM-only modules assume `document`/`window` availability** — **PARTIALLY RESOLVED** ⚠️
  - Files: [src/renderer/evaluate.ts](src/renderer/evaluate.ts#L1-L80), [src/renderer/dom.ts](src/renderer/dom.ts)
  - Symptom: direct `document.createElement`, comment nodes, fragments used unguarded.
  - Risk: importing these modules in SSR builds will throw at module-eval time.
  - Fix & status: SSR guards have been added in key hot-paths (`fastpath`, `reconcile`) and `evaluate` now performs a runtime DOM-availability check and no-ops when DOM is unavailable. This avoids module-eval failures; however, some modules are inherently DOM-focused and should be documented as DOM-only or further hardened if you want full SSR import safety.

## Low

- **Global diagnostic keys on `globalThis`** — **PARTIALLY RESOLVED** ⚠️
  - Files: `dom.ts`, `fastpath.ts`, `reconcile.ts` (multiple locations)
  - Symptom: diagnostic counters/stats are set on `globalThis` as top-level keys (`__ASKR_LAST_FASTPATH_STATS`, `__ASKR_FASTPATH_COUNTERS`, etc.).
  - Risk: collisions with consumer code, noisy global surface in shared environments.
  - Fix & status: diagnostics have been consolidated into a namespaced `__ASKR_DIAG` map and writes are now *only* performed to the namespace (`globalThis.__ASKR__`). Legacy top-level mirroring has been removed to eliminate global collisions. Fast-path dev instrumentation and console traces remain gated with the `ASKR_FASTPATH_DEBUG` environment flag — set it to `1` or `true` to enable verbose fast-path logs. This is a breaking change for any consumers depending on legacy top-level keys; update tests/tools to read from `globalThis.__ASKR__`.

- **Event listeners added without options (passive/capture)** — **RESOLVED (IMPROVED)** ✅
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts), [src/renderer/evaluate.ts](src/renderer/evaluate.ts)
  - Symptom: `addEventListener` invoked without options.
  - Risk: missed performance opportunities (e.g., `passive` for touch/wheel).
  - Fix & status: sensible default options are now chosen for known event types (e.g., `passive: true` for `wheel`, `scroll`, and touch events). You can extend this heuristic or expose an options API if you need more control.
