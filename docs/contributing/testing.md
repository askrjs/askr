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
- Use `tests/browser/*.test.ts` when the browser matters: SSR-to-hydration
  correctness, navigation, guarded routes, focus, keyboard navigation, overlays,
  layout-sensitive components, browser event loop behavior, and real CSS.
- Keep Playwright fixture scenarios realistic. Write them as small applications
  a developer would recognize: clean JSX, public Askr APIs, route/container
  components, semantic forms, and async data through `resource()`. Tests should
  drive these pages through roles, labels, URL changes, and network interception
  rather than mutating app state through test-only bridges.
- Use `tests/browser/browser-perf-smoke.test.ts` for coarse browser performance
  smoke assertions.
- Use `benches/*` for performance. Do not hide performance checks inside normal
  tests unless they are coarse smoke assertions.

When in doubt, start lower. Move up only when the lower layer cannot observe the
behavior honestly.

## Benchmarks

```bash
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts
cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier1.bench.config.ts --outputJson bench-results/tier1.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier2.bench.config.ts --outputJson bench-results/tier2.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier3.bench.config.ts --outputJson bench-results/tier3.json && cross-env NODE_ENV=production vp test bench --run --reporter=default --config vitest.tier4.bench.config.ts --outputJson bench-results/tier4.json && node scripts/generate-bench-log.js --verify
```

Microbenchmarks are Node-only. jsdom benchmarks measure DOM patching and
component loops without layout dependency. SSR benchmarks measure server output
and payload work.

## Related

- [Test Suite README](../../tests/README.md)
- [Benchmark Stability](../benchmarks/stability.md)
- [Guarantees Index](../reference/spec-guarantees.md)
