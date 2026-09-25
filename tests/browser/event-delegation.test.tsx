import { afterEach, describe, expect, test } from 'vite-plus/test';
import { userEvent } from 'vitest/browser';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

const cleanups: Array<() => void> = [];

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!();
});

function mountRoot(root?: HTMLElement): HTMLElement {
  if (root) {
    cleanups.push(() => cleanupApp(root));
    return root;
  }
  const { container, cleanup } = createTestContainer();
  cleanups.push(cleanup);
  return container;
}

function nextNativeEvent(target: EventTarget, type: string): Promise<void> {
  return new Promise((resolve) =>
    target.addEventListener(type, () => resolve(), { once: true })
  );
}

describe('event delegation matches native dispatch in a real browser', () => {
  test('should not run an ancestor onScroll when a descendant scrolls', async () => {
    const root = mountRoot();
    const calls: string[] = [];

    createIsland({
      root,
      component: () => (
        <div
          id="outer"
          style={{ height: '100px', overflow: 'auto' }}
          onScroll={() => calls.push('outer')}
        >
          <div
            id="inner"
            style={{ height: '50px', overflow: 'auto' }}
            onScroll={() => calls.push('inner')}
          >
            <div style={{ height: '500px' }}>{'tall'}</div>
          </div>
        </div>
      ),
    });
    flushScheduler();

    const inner = root.querySelector<HTMLElement>('#inner')!;
    const scrolled = nextNativeEvent(inner, 'scroll');
    inner.scrollTop = 100;
    await scrolled;

    expect(calls).toEqual(['inner']);
  });

  test('should not run an ancestor onFocus or onBlur for a descendant', () => {
    const root = mountRoot();
    const calls: string[] = [];

    createIsland({
      root,
      component: () => (
        <div
          id="group"
          onFocus={() => calls.push('group focus')}
          onBlur={() => calls.push('group blur')}
        >
          <button
            id="first"
            onFocus={() => calls.push('first focus')}
            onBlur={() => calls.push('first blur')}
          >
            {'first'}
          </button>
        </div>
      ),
    });
    flushScheduler();

    const first = root.querySelector<HTMLButtonElement>('#first')!;
    first.focus();
    first.blur();

    expect(calls).toEqual(['first focus', 'first blur']);
  });

  test('should let onWheel and onTouchMove cancel the default action', () => {
    const root = mountRoot();
    const seen: string[] = [];

    createIsland({
      root,
      component: () => (
        <div
          id="surface"
          onWheel={(event: Event) => {
            event.preventDefault();
            seen.push(`wheel ${event.defaultPrevented}`);
          }}
          onTouchStart={(event: Event) => {
            event.preventDefault();
            seen.push(`touchstart ${event.defaultPrevented}`);
          }}
          onTouchMove={(event: Event) => {
            event.preventDefault();
            seen.push(`touchmove ${event.defaultPrevented}`);
          }}
        >
          {'surface'}
        </div>
      ),
    });
    flushScheduler();

    const surface = root.querySelector<HTMLElement>('#surface')!;
    const wheel = new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    });
    surface.dispatchEvent(wheel);
    expect(seen).toEqual(['wheel true']);
    expect(wheel.defaultPrevented).toBe(true);

    // Firefox and WebKit desktop builds do not expose the TouchEvent
    // constructor; the passive intervention applies where they exist.
    if (typeof TouchEvent === 'function') {
      for (const type of ['touchstart', 'touchmove']) {
        const touch = new TouchEvent(type, { bubbles: true, cancelable: true });
        surface.dispatchEvent(touch);
        expect(touch.defaultPrevented).toBe(true);
      }
      expect(seen).toEqual(['wheel true', 'touchstart true', 'touchmove true']);
    }
  });

  test('should dispatch to apps mounted inside a shadow root', () => {
    const { container: host, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    const shadow = host.attachShadow({ mode: 'open' });
    const root = document.createElement('div');
    shadow.appendChild(root);
    mountRoot(root);
    const calls: string[] = [];

    createIsland({
      root,
      component: () => (
        <div onClick={() => calls.push('outer')}>
          <button id="shadow-button" onClick={() => calls.push('button')}>
            {'inside'}
          </button>
        </div>
      ),
    });
    flushScheduler();

    root.querySelector<HTMLButtonElement>('#shadow-button')!.click();

    expect(calls).toEqual(['button', 'outer']);
  });

  function renderShadowFixture(
    mode: ShadowRootMode,
    options: { stopAtWrapper?: boolean } = {}
  ) {
    const root = mountRoot();
    const calls: string[] = [];

    createIsland({
      root,
      component: () => (
        <div id="outer" onClick={() => calls.push('outer')}>
          <div id="host" onClick={() => calls.push('host')}>
            <div
              id="shadow-wrapper"
              onClick={(event: Event) => {
                calls.push('wrapper');
                if (options.stopAtWrapper) event.stopPropagation();
              }}
            >
              <button
                id="shadow-button"
                onClick={(event: Event) =>
                  calls.push(`button ${(event.currentTarget as Element).id}`)
                }
              >
                {'inside'}
              </button>
            </div>
          </div>
        </div>
      ),
    });
    flushScheduler();

    // Move app-rendered content into a shadow tree attached inside the app.
    const host = root.querySelector<HTMLElement>('#host')!;
    const wrapper = root.querySelector<HTMLElement>('#shadow-wrapper')!;
    const shadow = host.attachShadow({ mode });
    shadow.appendChild(wrapper);
    const button = wrapper.querySelector<HTMLButtonElement>('#shadow-button')!;
    return { calls, button };
  }

  test('should dispatch to handlers inside an open shadow root in an app', () => {
    const { calls, button } = renderShadowFixture('open');

    button.click();

    expect(calls).toEqual(['button shadow-button', 'wrapper', 'host', 'outer']);
  });

  test('should honor stopPropagation inside an open shadow root in an app', () => {
    const { calls, button } = renderShadowFixture('open', {
      stopAtWrapper: true,
    });

    button.click();

    expect(calls).toEqual(['button shadow-button', 'wrapper']);
  });

  test('should not reach handlers inside a closed shadow root from the app root', () => {
    const { calls, button } = renderShadowFixture('closed');

    button.click();

    // A closed shadow tree is hidden from listeners outside it, so the app
    // root only sees the retargeted host path.
    expect(calls).toEqual(['host', 'outer']);
  });

  test('should dispatch once to an app nested in an open shadow root of another app', () => {
    const outerRoot = mountRoot();
    const calls: string[] = [];

    createIsland({
      root: outerRoot,
      component: () => (
        <div id="outer-app" onClick={() => calls.push('outer app')}>
          <div id="shadow-host" onClick={() => calls.push('shadow host')} />
        </div>
      ),
    });
    flushScheduler();

    const host = outerRoot.querySelector<HTMLElement>('#shadow-host')!;
    const innerRoot = document.createElement('div');
    host.attachShadow({ mode: 'open' }).appendChild(innerRoot);
    mountRoot(innerRoot);
    createIsland({
      root: innerRoot,
      component: () => (
        <div onClick={() => calls.push('inner wrapper')}>
          <button id="inner-button" onClick={() => calls.push('inner button')}>
            {'inner'}
          </button>
        </div>
      ),
    });
    flushScheduler();

    innerRoot.querySelector<HTMLButtonElement>('#inner-button')!.click();

    expect(calls).toEqual([
      'inner button',
      'inner wrapper',
      'shadow host',
      'outer app',
    ]);
  });

  /** Render into an app, then move `#moved` into a shadow root on `#host`. */
  function renderIntoShadow(
    body: (calls: string[]) => unknown,
    mode: ShadowRootMode = 'open'
  ) {
    const root = mountRoot();
    const calls: string[] = [];
    createIsland({ root, component: () => body(calls) });
    flushScheduler();
    const host = root.querySelector<HTMLElement>('#host')!;
    const moved = root.querySelector<HTMLElement>('#moved')!;
    host.attachShadow({ mode }).appendChild(moved);
    return { root, calls, moved };
  }

  test('should expose the real target to handlers inside an open shadow root', () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div
        id="host"
        onClick={(e: Event) => calls.push(`host ${(e.target as Element).id}`)}
      >
        <div
          id="moved"
          onClick={(e: Event) =>
            calls.push(
              `moved ${(e.target as Element).id} ${(e.currentTarget as Element).id}`
            )
          }
        >
          <button id="shadow-target" />
        </div>
      </div>
    ));

    moved.querySelector<HTMLButtonElement>('#shadow-target')!.click();

    // Outside the shadow tree the target is retargeted to the host, as natively.
    expect(calls).toEqual(['moved shadow-target moved', 'host host']);
  });

  test('should keep retargeted targets when an inner handler detaches its node', () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div
        id="host"
        onClick={(e: Event) => calls.push(`host ${(e.target as Element).id}`)}
      >
        <div id="moved">
          <button
            id="shadow-target"
            onClick={(e: Event) => {
              calls.push(`button ${(e.target as Element).id}`);
              (e.currentTarget as Element).remove();
            }}
          />
        </div>
      </div>
    ));

    moved.querySelector<HTMLButtonElement>('#shadow-target')!.click();

    expect(calls).toEqual(['button shadow-target', 'host host']);
  });

  test('should read e.target.value in onInput inside an open shadow root', async () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div id="host">
        <input
          id="moved"
          onInput={(e: Event) =>
            calls.push((e.target as HTMLInputElement).value)
          }
        />
      </div>
    ));

    await userEvent.type(moved, 'a');

    expect(calls).toEqual(['a']);
  });

  test('should run onChange inside a shadow root', async () => {
    for (const mode of ['open', 'closed'] as const) {
      const { calls, moved } = renderIntoShadow(
        (calls) => (
          <div id="host">
            <input
              id="moved"
              type="checkbox"
              onChange={(e: Event) =>
                calls.push(`change ${(e.target as HTMLInputElement).checked}`)
              }
            />
          </div>
        ),
        mode
      );

      (moved as HTMLInputElement).click();

      expect(calls).toEqual(['change true']);
    }

    const { calls, moved } = renderIntoShadow((calls) => (
      <div id="host">
        <select id="moved" onChange={() => calls.push('select change')}>
          <option value="a">{'a'}</option>
          <option value="b">{'b'}</option>
        </select>
      </div>
    ));
    await userEvent.selectOptions(moved as HTMLSelectElement, 'b');
    expect(calls).toEqual(['select change']);
  });

  test('should run onSubmit inside a shadow root', () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div id="host" onSubmit={() => calls.push('host')}>
        <form
          id="moved"
          onSubmit={(e: Event) => {
            e.preventDefault();
            calls.push('submit');
          }}
        >
          <button type="submit">{'go'}</button>
        </form>
      </div>
    ));

    // Keep the test page from navigating if the handler never runs.
    moved.addEventListener('submit', (e) => e.preventDefault());
    moved.querySelector('button')!.click();

    // submit is not composed, so it never leaves the shadow tree.
    expect(calls).toEqual(['submit']);
  });

  test('should run handlers on the slot path of a slotted light child in bubbling order', () => {
    const { root, calls } = renderIntoShadow((calls) => (
      <div id="outer" onClick={() => calls.push('outer')}>
        <div id="host" onClick={() => calls.push('host')}>
          <span id="light" onClick={() => calls.push('light')}>
            {'x'}
          </span>
        </div>
        <div id="moved" onClick={() => calls.push('shadow wrapper')}>
          <slot />
        </div>
      </div>
    ));

    root.querySelector<HTMLElement>('#light')!.click();

    expect(calls).toEqual(['light', 'shadow wrapper', 'host', 'outer']);
  });

  test('should dispatch clicks on a slot and its fallback content inside an open shadow root', () => {
    const { calls, moved } = renderIntoShadow((calls) => {
      const record = (name: string) => (e: Event) =>
        calls.push(`${name} ${(e.target as Element).id ?? 'text'}`);
      return (
        <div id="outer" onClick={record('outer')}>
          <div id="host" onClick={record('host')} />
          <div id="moved" onClick={record('shadow wrapper')}>
            <slot id="fallback-slot" onClick={record('slot')}>
              {'fallback'}
            </slot>
          </div>
        </div>
      );
    });
    const slot = moved.querySelector<HTMLSlotElement>('#fallback-slot')!;

    // A click on fallback text targets the text node inside the slot.
    slot.firstChild!.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true })
    );
    expect(calls).toEqual([
      'slot text',
      'shadow wrapper text',
      'host host',
      'outer host',
    ]);

    calls.length = 0;
    slot.dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true })
    );
    expect(calls).toEqual([
      'slot fallback-slot',
      'shadow wrapper fallback-slot',
      'host host',
      'outer host',
    ]);
  });

  test('should honor stopImmediatePropagation inside an open shadow root', () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div id="host" onClick={() => calls.push('host')}>
        <button
          id="moved"
          onClick={(e: Event) => {
            calls.push('button');
            e.stopImmediatePropagation();
          }}
        />
      </div>
    ));

    (moved as HTMLButtonElement).click();

    expect(calls).toEqual(['button']);
  });

  test('should dispatch once to an app nested under an open shadow root with outer shadow handlers', () => {
    const { calls, moved } = renderIntoShadow((calls) => (
      <div id="outer-app" onClick={() => calls.push('outer app')}>
        <div id="host" onClick={() => calls.push('host')} />
        <div id="moved" onClick={() => calls.push('shadow wrapper')} />
      </div>
    ));
    const innerRoot = document.createElement('div');
    moved.appendChild(innerRoot);
    mountRoot(innerRoot);
    createIsland({
      root: innerRoot,
      component: () => (
        <button id="inner-button" onClick={() => calls.push('inner')} />
      ),
    });
    flushScheduler();

    innerRoot.querySelector<HTMLButtonElement>('#inner-button')!.click();

    expect(calls).toEqual(['inner', 'shadow wrapper', 'host', 'outer app']);
  });

  test('should dispatch to apps mounted inside a same-origin iframe', () => {
    const iframe = document.createElement('iframe');
    document.body.appendChild(iframe);
    cleanups.push(() => iframe.remove());
    const frameDocument = iframe.contentDocument!;
    const root = frameDocument.createElement('div');
    frameDocument.body.appendChild(root);
    mountRoot(root);
    const calls: string[] = [];

    createIsland({
      root,
      component: () => (
        <button id="frame-button" onClick={() => calls.push('button')}>
          {'inside'}
        </button>
      ),
    });
    flushScheduler();

    root.querySelector<HTMLButtonElement>('#frame-button')!.click();

    expect(calls).toEqual(['button']);
  });

  test('should isolate nested roots so each handler runs once in bubbling order', () => {
    const outerRoot = mountRoot();
    const calls: string[] = [];
    let innerRoot: HTMLElement | null = null;

    createIsland({
      root: outerRoot,
      component: () => (
        <div id="outer-app" onClick={() => calls.push('outer app')}>
          <div
            id="inner-host"
            ref={(element: HTMLElement | null) => {
              innerRoot = element;
            }}
          />
        </div>
      ),
    });
    flushScheduler();

    mountRoot(innerRoot!);
    createIsland({
      root: innerRoot!,
      component: () => (
        <div onClick={() => calls.push('inner wrapper')}>
          <button id="inner-button" onClick={() => calls.push('inner button')}>
            {'inner'}
          </button>
        </div>
      ),
    });
    flushScheduler();

    outerRoot.querySelector<HTMLButtonElement>('#inner-button')!.click();

    expect(calls).toEqual(['inner button', 'inner wrapper', 'outer app']);
  });
});
