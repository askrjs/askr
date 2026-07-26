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

## Testing Components As A Consumer

Use the supported component harness from `@askrjs/askr/testing`. It mounts
through the production renderer and scheduler; it does not install or replace
DOM globals.

Configure Vitest with jsdom and Askr's automatic JSX runtime:

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  oxc: {
    jsx: {
      runtime: 'automatic',
      importSource: '@askrjs/askr',
    },
  },
  test: {
    environment: 'jsdom',
  },
});
```

Render a component, dispatch a bubbling event, flush pending work, and clean up
the owned root after each test:

```tsx
import { afterEach, expect, test } from 'vitest';
import { state } from '@askrjs/askr';
import { dispatch, render, type RenderResult } from '@askrjs/askr/testing';

let view: RenderResult | undefined;

afterEach(() => view?.cleanup());

test('increments the counter', () => {
  view = render(() => {
    const count = state(0);
    return <button onClick={() => count.set(count() + 1)}>{count()}</button>;
  });

  const button = view.root.querySelector('button')!;
  dispatch(button, 'click');
  view.flush();

  expect(button.textContent).toBe('1');
});
```

Pass `container` to `render` or `mount` to retain an existing container after
cleanup. Without one, the harness creates and removes a managed container.
`renderRoute({ registry, url })` uses the production SPA router and restores the
previous URL during cleanup.

Each result owns its cleanup, so sibling renders can be torn down independently.
Test files remain isolated by the test runner's jsdom realm. The harness fails
with a configuration hint when no DOM environment exists.

Ordinary `render` and `mount` results can coexist in one realm. Because
`renderRoute` uses the production SPA router and browser history, keep only one
routed render active per jsdom realm and clean it up before starting another.

`@askrjs/askr/testing` covers component, renderer, and router tests.
`@askrjs/testing` is a separate package for HTTP and server test clients; it
does not mount Askr components.

## Benchmarks

```bash
npm run bench:tier1
npm run bench:tier2
npm run bench:tier3
npm run bench:tier4
npm run bench:tier1 -- --outputJson bench-results/tier1.json && npm run bench:tier2 -- --outputJson bench-results/tier2.json && npm run bench:tier3 -- --outputJson bench-results/tier3.json && npm run bench:tier4 -- --outputJson bench-results/tier4.json
```

Microbenchmarks are Node-only. jsdom benchmarks measure DOM patching and
component loops without layout dependency. SSR benchmarks measure server output
and payload work.

## Related

- [Test Suite README](../../tests/README.md)
- [Benchmark Stability](../benchmarks/stability.md)
- [Guarantees Index](../reference/spec-guarantees.md)
