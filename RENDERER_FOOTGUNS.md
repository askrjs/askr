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

- **DOM-only modules assume `document`/`window` availability** — **RESOLVED** ✅
  - Files: [src/renderer/evaluate.ts](src/renderer/evaluate.ts#L1-L80), [src/renderer/dom.ts](src/renderer/dom.ts), [src/renderer/fastpath.ts](src/renderer/fastpath.ts), [src/renderer/reconcile.ts](src/renderer/reconcile.ts)
  - Symptom: direct `document.createElement`, comment nodes, fragments used unguarded could throw on import in SSR.
  - Risk: importing these modules in SSR builds would previously throw at module-eval time.
  - Fix & status: SSR guards have been added in hot paths (`fastpath`, `reconcile`, `evaluate`, and `dom`), and `evaluate` now early-returns safely when the DOM is unavailable. Added an SSR import test (`tests/ssr/import_dom_modules.test.ts`) that dynamically imports renderer modules with `document`/`window` removed to ensure no module-eval failures. The renderer modules are now safe to import in SSR contexts without throwing.

## Low

- **Global diagnostic keys on `globalThis`** — **RESOLVED (REMOVAL / BREAKING CHANGE)** ⚠️
  - Files: `dom.ts`, `fastpath.ts`, `reconcile.ts`, `diag/index.ts` (multiple locations)
  - Symptom: diagnostic counters/stats were previously set on `globalThis` as top-level keys (`__ASKR_LAST_FASTPATH_STATS`, `__ASKR_FASTPATH_COUNTERS`, etc.), causing potential collisions and a noisy global surface.
  - Risk: collisions with consumer code, accidental leaks across test runs, and accidental coupling to implementation details.
  - Fix & status: diagnostics have been consolidated into a single namespaced diagnostics object available at `globalThis.__ASKR__` (backed by an internal diag map). All code and tests now read/write to `globalThis.__ASKR__` and legacy top-level mirroring has been removed to eliminate global collisions.

  - Migration & guidance:
    - Update any tests or tooling that relied on top-level keys (e.g., `__DOM_REPLACE_COUNT` or `__ASKR_LAST_FASTPATH_STATS`) to read from the namespace instead:

      ```ts
      const ns = ((globalThis as any).__ASKR__) || {};
      const stats = ns['__LAST_FASTPATH_STATS'];
      const domReplaceCount = ns['__DOM_REPLACE_COUNT'];
      ```

    - If you need a transitional shim for downstream tooling, add a short dev-only helper that mirrors namespaced keys to top-level for one release only (recommended to warn consumers):

      ```ts
      if (process.env.NODE_ENV !== 'production') {
        const ns = (globalThis as any).__ASKR__ || {};
        try {
          for (const k of Object.keys(ns)) {
            try { (globalThis as any)[k] = ns[k]; } catch (e) { /* ignore */ }
          }
          console.warn('[Askr] Temporary legacy diag shim enabled — read from globalThis.__ASKR__ instead (deprecated)');
        } catch (e) { /* ignore */ }
      }
      ```

    - This change is breaking for any consumers depending on top-level globals; consider adding a short deprecation notice in your release notes and bumping the next release appropriately.

  - Rationale: keeping diagnostics namespaced avoids global pollution and reduces the risk of accidental collisions with consumer code, while still providing a discoverable, single object for dev tooling and tests.

  - Tests & status: tests and runtime diagnostics were updated to use the `__ASKR__` namespace and the full test suite passes locally. If you prefer a gentler migration, I can add an optional transient shim as a follow-up PR.

- **Event listeners added without options (passive/capture)** — **RESOLVED (IMPROVED)** ✅
  - Files: [src/renderer/dom.ts](src/renderer/dom.ts), [src/renderer/evaluate.ts](src/renderer/evaluate.ts)
  - Symptom: `addEventListener` invoked without options.
  - Risk: missed performance opportunities (e.g., `passive` for touch/wheel).
  - Fix & status: sensible default options are now chosen for known event types (e.g., `passive: true` for `wheel`, `scroll`, and touch events). You can extend this heuristic or expose an options API if you need more control.
