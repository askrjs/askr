import { afterEach, describe, expect, test } from 'vite-plus/test';
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
