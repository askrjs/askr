# Testing Guide

Askr uses layered tests so each behavior is covered at the cheapest accurate
level.

## Commands

```bash
npm run test:unit
npm run test:jsdom
npm run test:browser
npm run test:a11y
npm run test:browser:smoke
npm test
```

Install browser binaries once per machine with:

```bash
npm run test:browser:install
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
- Use `tests/playwright/a11y` for axe-backed accessibility scans and semantic
  interaction checks.
- Use `benches/*` for performance. Do not hide performance checks inside normal
  tests unless they are coarse smoke assertions.

When in doubt, start lower. Move up only when the lower layer cannot observe the
behavior honestly.

## Benchmarks

```bash
npm run bench:micro
npm run bench:jsdom
npm run bench:ssr
npm run bench:browser
npm run bench:verify
```

Microbenchmarks are Node-only. jsdom benchmarks measure DOM patching and
component loops without layout dependency. SSR benchmarks measure server output
and payload work. Browser benchmarks are few, trend-oriented, and run through
Playwright.

## Related

- [Test Suite README](../../tests/README.md)
- [Benchmark Stability](../benchmarks/stability.md)
- [Guarantees Index](../reference/spec-guarantees.md)
