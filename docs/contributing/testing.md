# Testing Guide

Askr uses layered tests so each behavior is covered at the cheapest accurate
level.

## Commands

```bash
npm run test:unit
npm run test:jsdom
npm run test:browser
npm test
```

Install browser binaries once per machine with:

```bash
playwright install chromium firefox webkit
```

## Choosing A Layer

- Use `tests/unit` for pure logic and isolated internals: router matching,
  params, guards, signals/reactivity, scheduler queues, compiler helpers,
  serialization, error handling, and public API edge cases.
- Use `tests/jsdom` for DOM-like behavior: component rendering, event handler
  wiring, simple DOM updates, forms, conditionals, lists, lifecycle, and basic
  hydration smoke coverage.
- Use `tests/playwright/e2e` when the browser matters: SSR-to-hydration
  correctness, navigation, guarded routes, focus, keyboard navigation, overlays,
  layout-sensitive components, browser event loop behavior, and real CSS.
- Keep Playwright fixture scenarios realistic. Write them as small applications
  a developer would recognize: clean JSX, public Askr APIs, route/container
  components, semantic forms, and async data through `resource()`. Tests should
  drive these pages through roles, labels, URL changes, and network interception
  rather than mutating app state through test-only bridges.
- Use `tests/playwright/a11y` for axe-backed accessibility scans and semantic
  interaction checks.
- Use `benches/*` for performance. Do not hide performance checks inside normal
  tests unless they are coarse smoke assertions.

When in doubt, start lower. Move up only when the lower layer cannot observe the
behavior honestly.

## Benchmarks

```bash
vp test bench -c vitest.bench.micro.config.ts --run
vp test bench -c vitest.bench.dom.config.ts --run
vp test bench -c vitest.bench.ssr.config.ts --run
playwright test benches/browser --project=browser-perf
vp test bench -c vitest.bench.micro.config.ts --run --outputJson bench-results/micro.json && vp test bench -c vitest.bench.dom.config.ts --run --outputJson bench-results/jsdom.json && vp test bench -c vitest.bench.ssr.config.ts --run --outputJson bench-results/ssr.json && node scripts/generate-bench-log.js --verify
```

Microbenchmarks are Node-only. jsdom benchmarks measure DOM patching and
component loops without layout dependency. SSR benchmarks measure server output
and payload work. Browser benchmarks are few, trend-oriented, and run through
Playwright.

## Related

- [Test Suite README](../../tests/README.md)
- [Benchmark Stability](../benchmarks/stability.md)
- [Guarantees Index](../reference/spec-guarantees.md)
