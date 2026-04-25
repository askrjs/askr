# Askr Test Suite Architecture

Askr tests are split by the runtime guarantees they need. Choose the lowest
layer that can prove the behavior.

## Layers

- `tests/unit`: pure logic and isolated framework internals. These tests run in
  Node, must not touch `document`, `window`, browser element classes, jsdom, or
  Playwright.
- `tests/jsdom`: DOM-like component behavior that does not need layout, paint,
  real focus, browser timing, or CSS engine behavior.
- `tests/playwright/e2e`: user-centric real-browser behavior such as routing,
  hydration, focus, keyboard flow, overlays, browser event loop behavior, and
  CSS-sensitive UI.
- `tests/playwright/a11y`: axe-backed accessibility scans plus semantic locator
  and keyboard assertions.
- `tests/playwright/perf`: coarse browser performance smoke checks. Detailed
  browser benchmark trend capture lives in `benches/browser`.

Shared test harness code lives outside the suite layers:

- `test-utils/fixtures`: reusable components and scenario data.
- `test-utils/render`: jsdom render helpers and scheduler observation helpers.
- `test-utils/router`, `test-utils/hydration`, `test-utils/perf`: reserved for
  layer-specific helpers as coverage grows.

## Running Tests

```bash
npm run test:unit
npm run test:jsdom
npm run test:browser
npm run test:a11y
npm run test:browser:smoke
npm test
```

`npm test` runs unit, jsdom, Chromium browser, and a11y checks. Cross-browser
smoke coverage is separate because Firefox and WebKit are intentionally small,
high-signal confirmation lanes.

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

- `benches/micro`: Node-only hot paths.
- `benches/jsdom`: DOM patching and component render/update loops without
  layout dependency.
- `benches/ssr`: render-to-string, streaming SSR, route-level SSR, and payload
  generation.
- `benches/browser`: a small Playwright trend suite for browser-only costs.

Run stable non-browser lanes with:

```bash
npm run bench
npm run bench:verify
```

Browser benchmarks are explicit:

```bash
npm run bench:browser
```

## Enforcement

`tests/unit/dev_checks` validates suite conventions, layer boundaries, browser
runtime env access, JSX syntax, and benchmark category rules. If a new test
needs a higher layer, move the test rather than weakening the rule.
