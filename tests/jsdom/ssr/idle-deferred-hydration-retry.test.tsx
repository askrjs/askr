import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { createRouteRegistry, route } from '../../../src/router/route';
import { renderToString } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('idle activation of deferred hydration boundaries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function hydrateFailingBoundary() {
    const { container, cleanup } = createTestContainer();
    let fail = false;
    let clicks = 0;
    let attempts = 0;
    let top = 1000;
    const Below = () => {
      attempts += 1;
      if (fail) throw new Error('temporary deferred render failure');
      return (
        <button id="retry-after-idle" onClick={() => clicks++}>
          Retry
        </button>
      );
    };
    const App = () => (
      <main>
        <section class="deferred">
          <Below />
        </section>
      </main>
    );
    const registry = createRouteRegistry(() => route('/', App));
    container.innerHTML = renderToString({ url: '/', registry });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return {
          top: this.classList.contains('deferred') ? top : 0,
        } as DOMRect;
      }
    );
    const addWindowListener = vi.spyOn(window, 'addEventListener');
    const removeWindowListener = vi.spyOn(window, 'removeEventListener');
    const addRootListener = vi.spyOn(container, 'addEventListener');
    const removeRootListener = vi.spyOn(container, 'removeEventListener');
    fail = true;
    await hydrateSPA({
      root: container,
      registry,
      hydrate: {
        deferBelowFold: true,
        deferUntilIdle: true,
        foldThreshold: 100,
        verifyMarkup: false,
      },
    });
    flushScheduler();
    const boundary = container.querySelector('.deferred')!;
    const button =
      container.querySelector<HTMLButtonElement>('#retry-after-idle')!;
    const scrollListener = addWindowListener.mock.calls.find(
      ([type]) => type === 'scroll'
    )![1];
    const captureListeners = addRootListener.mock.calls.filter(
      ([, , capture]) => capture === true
    );
    return {
      container,
      cleanup,
      boundary,
      button,
      recover() {
        fail = false;
        top = 0;
      },
      clicks: () => clicks,
      attempts: () => attempts,
      scrollRemovals: () =>
        removeWindowListener.mock.calls.filter(
          ([type, listener]) => type === 'scroll' && listener === scrollListener
        ).length,
      captureRemovals: () =>
        captureListeners.every(([type, listener]) =>
          removeRootListener.mock.calls.some(
            ([removedType, removedListener, capture]) =>
              removedType === type &&
              removedListener === listener &&
              capture === true
          )
        ),
    };
  }

  it.each(['scroll', 'interaction'])(
    'should retry failed idle activation on a later %s and release reveal listeners after success',
    async (reveal) => {
      const test = await hydrateFailingBoundary();
      try {
        expect(test.boundary.hasAttribute('data-skip-hydrate')).toBe(true);
        expect(test.scrollRemovals()).toBe(0);
        expect(test.captureRemovals()).toBe(false);
        test.recover();
        if (reveal === 'scroll') {
          window.dispatchEvent(new Event('scroll'));
          flushScheduler();
        }
        test.button.click();
        flushScheduler();

        expect(test.boundary.hasAttribute('data-skip-hydrate')).toBe(false);
        expect(test.clicks()).toBe(1);
        expect(test.scrollRemovals()).toBe(1);
        expect(test.captureRemovals()).toBe(true);
        const attempts = test.attempts();
        window.dispatchEvent(new Event('scroll'));
        expect(test.attempts()).toBe(attempts);
      } finally {
        test.cleanup();
      }
    }
  );

  it('should release retained reveal listeners when the failed root is cleaned up', async () => {
    const test = await hydrateFailingBoundary();
    try {
      expect(test.boundary.hasAttribute('data-skip-hydrate')).toBe(true);
      expect(test.scrollRemovals()).toBe(0);
      expect(test.captureRemovals()).toBe(false);
      test.container.innerHTML = '';

      expect(test.scrollRemovals()).toBe(1);
      expect(test.captureRemovals()).toBe(true);
      test.recover();
      const attempts = test.attempts();
      window.dispatchEvent(new Event('scroll'));
      test.button.click();
      expect(test.attempts()).toBe(attempts);
      expect(test.clicks()).toBe(0);
    } finally {
      test.cleanup();
    }
  });

  it('should drain reveal resources when idle activates one boundary and an interaction activates the last', async () => {
    const { container, cleanup } = createTestContainer();
    let fail = false;
    let clicks = 0;
    const Failing = () => {
      if (fail) throw new Error('temporary deferred render failure');
      return <button onClick={() => clicks++}>Retry</button>;
    };
    const App = () => (
      <main>
        <section class="deferred ready">Ready</section>
        <section class="deferred failing">
          <Failing />
        </section>
      </main>
    );
    const registry = createRouteRegistry(() => route('/', App));
    container.innerHTML = renderToString({ url: '/', registry });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: Element) {
        return {
          top: this.classList.contains('deferred') ? 1000 : 0,
        } as DOMRect;
      }
    );
    const addRootListener = vi.spyOn(container, 'addEventListener');
    const removeRootListener = vi.spyOn(container, 'removeEventListener');
    fail = true;
    try {
      await hydrateSPA({
        root: container,
        registry,
        hydrate: {
          deferBelowFold: true,
          deferUntilIdle: true,
          foldThreshold: 100,
          verifyMarkup: false,
        },
      });
      expect(
        container.querySelector('.ready')!.hasAttribute('data-skip-hydrate')
      ).toBe(false);
      expect(
        container.querySelector('.failing')!.hasAttribute('data-skip-hydrate')
      ).toBe(true);
      fail = false;
      container.querySelector<HTMLButtonElement>('button')!.click();
      flushScheduler();

      expect(
        container.querySelector('.failing')!.hasAttribute('data-skip-hydrate')
      ).toBe(false);
      expect(clicks).toBe(1);
      const captures = addRootListener.mock.calls.filter(
        ([, , capture]) => capture === true
      );
      expect(captures).toHaveLength(9);
      for (const [type, listener] of captures) {
        expect(removeRootListener.mock.calls).toContainEqual([
          type,
          listener,
          true,
        ]);
      }
    } finally {
      cleanup();
    }
  });
});
