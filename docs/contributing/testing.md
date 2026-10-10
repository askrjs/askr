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
  hydration coverage.
- Use `tests/browser/*.test.ts` when the browser matters: SSR-to-hydration
  correctness, navigation, guarded routes, focus, keyboard navigation, overlays,
  layout-sensitive components, browser event loop behavior, and real CSS.
- Keep Playwright fixture scenarios realistic. Write them as small applications
  a developer would recognize: clean JSX, public Askr APIs, route/container
  components, semantic forms, and async data through `resource()`. Tests should
  drive these pages through roles, labels, URL changes, and network interception
  rather than mutating app state through test-only bridges.
- Use `benches/*` for performance. Do not hide performance checks inside normal
  tests.

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

Pass `container` to `render` to retain an existing container after
cleanup. Without one, the harness creates and removes a managed container.
`renderRoute({ registry, url })` uses the production SPA router and restores the
previous URL during cleanup.

Interaction helpers drive the same delegated events a browser would:
`click(element)` dispatches one bubbling `click` `MouseEvent` (no
pointerdown, mousedown, or mouseup sequence), `type(input, text)` appends `text` to a text control's value one
character at a time, emitting an input event for each, and
`submit(form)` dispatches a cancelable bubbling submit event. `dispatch()`
sends any other event, `flush()` runs pending work, and `cleanup(view)` tears
down a render given its result or container.

Each result owns its cleanup, so sibling renders can be torn down independently.
Test files remain isolated by the test runner's jsdom realm. The harness fails
with a configuration hint when no DOM environment exists.

Ordinary `render` results can coexist in one realm. Because
`renderRoute` uses the production SPA router and browser history, keep only one
routed render active per jsdom realm and clean it up before starting another.

`@askrjs/askr/testing` covers component, renderer, and router tests.
`@askrjs/testing` is a separate package for HTTP and server test clients; it
does not mount Askr components.

## Accessible Queries And User Interactions

Compose the native harness with DOM Testing Library and user-event when a
component test needs accessible role/name/label queries or realistic input
sequences:

```bash
npm install --save-dev @testing-library/dom @testing-library/user-event
```

These are optional development dependencies of your application. Askr does not
re-export them or require them at runtime. The qualified recipe uses DOM Testing
Library 10.4.2 and user-event 14.6.7 with jsdom; it requires no React.

```tsx
import { expect, test } from 'vitest';
import { within, waitFor } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import { createDataRuntime, disposeDataRuntime } from '@askrjs/askr/data';
import { render } from '@askrjs/askr/testing';
import { ProfileForm } from './ProfileForm';

test('saves the display name', async () => {
  const runtime = createDataRuntime();
  const view = render(ProfileForm, { dataRuntime: runtime });
  const queries = within(view.container);
  const user = userEvent.setup({ document: view.container.ownerDocument });
  try {
    const name = queries.getByRole('textbox', { name: 'Display name' });
    await user.clear(name);
    await user.type(name, 'Ada');
    view.flush();
    await user.click(queries.getByRole('button', { name: 'Save' }));
    await waitFor(
      () => {
        view.flush();
        expect(queries.getByRole('status').textContent).toBe('Saved Ada');
      },
      { container: view.container }
    );
  } finally {
    view.cleanup();
    disposeDataRuntime(runtime);
  }
});
```

`getByLabelText('Display name')` follows the control's label association.
`getByRole('textbox', { name: 'Display name', description: 'Public name' })`
also checks its accessible description. Scope each query set with
`within(view.container)` so two independent renders may both contain a Save
button. Use distinct document-wide IDs for their label/description targets.
For a routed screen, await `renderRoute({ registry, url, dataRuntime })`, then
use the same query/interaction recipe; keep one routed view per realm because
the router shares browser history. Ordinary component renders use the islands
execution model; routed renders use SPA. Keep these in separate test files with
isolated DOM realms. Cleanup does not permit mixing execution models in one
realm. Author the application registry before bootstrapping its SPA, as in an
application.

Await every interaction before flushing or tearing down its view. Create a
user-event setup per test, release any deliberately held keys, and let the
test environment restore its DOM/clipboard globals. user-event has no supported
dispose method. A view's cleanup cannot cancel an arbitrary unfinished
third-party interaction.

`view.flush()` drains synchronous Askr scheduler work. It does not resolve a
network promise. For loading/error/retry tests, explicitly complete or reject
the test-owned request, then use `waitFor` to flush and assert the settled DOM.
Perform each user action once outside `waitFor`; a retrying assertion must not
repeat a click or mutation. Inject separate data runtimes for independent
views, clean each view up, then dispose only the runtime you own to retire
pending data work. Other renders and their runtimes remain live.

The executed recipe covers controlled input selection/replacement, disabled
buttons, Tab/Shift+Tab, Enter/Space activation, a nonmodal popup's Escape
dismissal and focus restoration, routed rendering, async error/retry, listener
cleanup and two-runtime isolation. The popup is a small test-owned component;
it does not establish UI-package dialog or menu behavior.

Simple `click`/`type`/`dispatch` helpers remain useful for direct handler and
event contracts. user-event simulates a UI sequence in jsdom; it does not prove
trusted browser events, layout, pointer hit testing or a browser accessibility
tree. Native Playwright-backed Chromium, Firefox and WebKit cases separately
qualify focus traversal, selection, activation and dismissal. Use those browser
tests when browser defaults or layout affect the result.
On macOS WebKit, the native case uses Option-Tab/Option-Shift-Tab to include
buttons under its default keyboard-navigation setting; see the
[Safari keyboard shortcuts](https://support.apple.com/guide/safari/cpsh003/mac).

## Benchmarks

```bash
npm run bench:tier1
npm run bench:tier2
npm run bench:tier1 -- --outputJson bench-results/tier1.json && npm run bench:tier2 -- --outputJson bench-results/tier2.json
```

Benchmarks run in Node and jsdom; there is no browser benchmark lane. jsdom
benchmarks measure DOM patching and component loops without layout dependency.
SSR benchmarks measure server output and payload work.

## Related

- [Test Suite README](../../tests/README.md)
- [Benchmark Stability](../benchmarks/stability.md)
- [Guarantees Index](../reference/spec-guarantees.md)
