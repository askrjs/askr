# Askr Test Suite Architecture

Askr tests are split by the runtime guarantees they need. Choose the lowest
layer that can prove the behavior.

## Layers

- `tests/unit`: pure logic and isolated framework internals. These tests run in
  Node, must not touch `document`, `window`, browser element classes, jsdom, or
  Playwright.
- `tests/jsdom`: DOM-like component behavior that does not need layout, paint,
  real focus, browser timing, or CSS engine behavior.
- `tests/browser`: user-centric real-browser behavior such as routing,
  hydration, focus, keyboard flow, overlays, browser event loop behavior, and
  CSS-sensitive UI. Browser performance smoke checks live here as
  `browser-perf-smoke.test.ts`.

Shared test harness code lives outside the suite layers:

- `test-utils/fixtures`: reusable components and scenario data.
- `test-utils/render`: jsdom render helpers and scheduler observation helpers.
- `test-utils/router`, `test-utils/hydration`, `test-utils/perf`: reserved for
  layer-specific helpers as coverage grows.

## Running Tests

```bash
npm test
npm run test:unit
npm run test:jsdom
npm run test:browser
```

`npm test` runs the full local test matrix: unit, jsdom, and the browser suite.

## Layer Rules

Unit tests cover router matching, route params, guards, reactivity, scheduler
internals, render/diff primitives, compiler helpers, serialization utilities,
error handling, and public API edge cases. Prefer table-driven cases and failure
paths.

jsdom tests cover component rendering, event wiring, simple DOM updates,
form/input behavior, conditional/list rendering, lifecycle behavior, and basic
hydration smoke tests. Do not use jsdom for layout, paint, animation, browser
timing correctness, or realistic focus behavior.

Playwright tests cover behavior that needs an actual browser. Use semantic
locators or `data-testid` consistently, avoid fragile timing assertions, and
let traces on failure capture debugging context.

Accessibility tests run in Playwright with axe. Treat automated scans as a
baseline, then add semantic and keyboard assertions for the specific interaction
being covered.

## Benchmarks

Benchmarks live outside `tests`:

- `benches/tier1`: hot path benchmarks.
- `benches/tier2`: subsystem benchmarks.
- `benches/tier3`: system benchmarks.
- `benches/tier4`: integration benchmarks.

Run stable non-browser lanes with:

```bash
npm run bench
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

## Enforcement

`tests/unit/dev_checks` validates suite conventions, layer boundaries, browser
runtime env access, JSX syntax, and benchmark category rules. If a new test
needs a higher layer, move the test rather than weakening the rule.
