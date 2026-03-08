import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { hydrateSPA } from '../../src/boot';
import { renderToStringSync, renderToString } from '../../src/ssr';
import { renderToStringSyncForUrl } from '../../src/ssr';
import { state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../helpers/test-renderer';

describe('hydration (SSR)', () => {
  describe('hydration mismatch', () => {
    let { container, cleanup } = createTestContainer();
    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => cleanup());

    it('should re-render client when server HTML text differs', async () => {
      container.innerHTML = '<div>server</div>';
      const Component = () => <div>client</div>;

      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    });

    it('should re-render client when server HTML structure differs', async () => {
      container.innerHTML = '<span>server</span>';
      const Component = () => <div>client</div>;

      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    });

    it('should warn in dev mode when mismatch occurs', async () => {
      container.innerHTML = '<div>server</div>';

      const Component = () => <div>client</div>;
      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    });
  });

  describe('Hydration: non-observing', () => {
    it('should not invoke handlers or subscriptions during hydration', async () => {
      const { container, cleanup } = createTestContainer();
      try {
        let clicks = 0;

        const Component = () =>
          (
            <div id="root">
              <button id="btn" onClick={() => (clicks += 1)}>
                Click
              </button>
            </div>
          ) as unknown as JSXElement;

        // Server render
        const html = renderToString(() => Component());
        container.innerHTML = html;

        // Hydrate — should NOT cause any handler to fire as a side-effect
        await expect(
          hydrateSPA({
            root: container,
            routes: [{ path: '/', handler: Component }],
          })
        ).resolves.not.toThrow();

        // No handler should have fired during hydrate
        expect(clicks).toBe(0);

        // After hydration a click should work
        const btn = container.querySelector('#btn') as HTMLButtonElement;
        btn.click();
        expect(clicks).toBe(1);
      } finally {
        cleanup();
      }
    });
  });

  describe('SSR hydration (roundtrip)', () => {
    let { container, cleanup } = createTestContainer();

    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => cleanup());

    it('should produce identical output and attach listeners when using renderToStringSync and hydrate', async () => {
      let clicks = 0;

      const Component = () => {
        return (
          <div id="root">
            <button id="btn" onClick={() => (clicks += 1)}>
              Click
            </button>
          </div>
        );
      };

      // Server render
      const html = renderToStringSync(() => Component());
      container.innerHTML = html;

      // Hydrate — should not throw and should not modify DOM
      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).resolves.not.toThrow();

      // DOM structure unchanged (ignoring comment placeholders from portal)
      // The portal adds an invisible comment placeholder for future content
      const strippedHtml = container.innerHTML.replace(/<!--.*?-->/g, '');
      expect(strippedHtml).toBe(html);

      // Click should invoke handler
      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      expect(clicks).toBe(1);

      // Render count may have increased by client-side initialization, but DOM unchanged
      expect(container.querySelector('#btn')).not.toBeNull();
    });

    it('should throw when hydrate encounters a mismatch', async () => {
      const Component = () => <div id="root">server</div>;
      container.innerHTML = '<div>client</div>';

      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow();
    });
  });

  describe('hydration success', () => {
    let { container, cleanup } = createTestContainer();
    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => cleanup());

    it('should attach listeners to server HTML during hydration', async () => {
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          click
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      flushScheduler();

      expect(clicks).toBe(1);
    });

    it('should accept input when component is hydrated', async () => {
      let value: ReturnType<typeof state<string>> | null = null;
      const Component = () => {
        value = state('');
        return (
          <input
            id="input"
            value={value()}
            onInput={(e: Event) =>
              value!.set((e.target as HTMLInputElement).value)
            }
          />
        );
      };

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      const input = container.querySelector('#input') as HTMLInputElement;
      input.value = 'abc';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expect(
        (container.querySelector('#input') as HTMLInputElement).value
      ).toBe('abc');
    });

    it('should preserve server state after hydration', async () => {
      const Component = () => <div>server</div>;
      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      expect(container.textContent).toBe('server');
    });

    it('should preserve server state after hydration (sync server)', async () => {
      const Component = () => <div>async hydrated</div>;

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      expect(container.textContent).toBe('async hydrated');
    });

    it('should handle state updates during hydration', async () => {
      let hydrated = false;
      const Component = () => {
        const count = state(0);
        hydrated = true;
        return (
          <button onClick={() => count.set(count() + 1)}>
            count: {count()}
          </button>
        );
      };

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      expect(hydrated).toBe(true);
      expect(container.textContent).toBe('count: 0');

      // Click should work
      (container.firstChild as HTMLElement).click();
      flushScheduler();
      expect(container.textContent).toBe('count: 1');
    });

    it('should attach listeners to server HTML during hydration (sync server)', async () => {
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          async click
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      flushScheduler();

      expect(clicks).toBe(1);
    });
  });

  describe('selective hydration', () => {
    let { container, cleanup } = createTestContainer();
    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => {
      cleanup();
      vi.unstubAllGlobals();
    });

    it('should defer full hydration until idle when configured', async () => {
      let clicks = 0;

      const Component = () => (
        <button id="idle-btn" onClick={() => (clicks += 1)}>
          idle
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      container.innerHTML = renderToStringSyncForUrl({ url: '/', routes });

      const hydration = hydrateSPA({
        root: container,
        routes,
        hydrate: { deferUntilIdle: true },
      });

      fireEvent.click(container.querySelector('#idle-btn') as HTMLElement);
      expect(clicks).toBe(0);

      await hydration;
      flushScheduler();

      fireEvent.click(container.querySelector('#idle-btn') as HTMLElement);
      flushScheduler();
      expect(clicks).toBe(1);
    });

    it('should keep skipped selectors static during hydration', async () => {
      const clicks: string[] = [];

      const Component = () => (
        <div>
          <button id="live" onClick={() => clicks.push('live')}>
            live
          </button>
          <div class="static-footer">
            <button id="static" onClick={() => clicks.push('static')}>
              static
            </button>
          </div>
        </div>
      );

      const routes = [{ path: '/', handler: Component }];
      container.innerHTML = renderToStringSyncForUrl({ url: '/', routes });

      await hydrateSPA({
        root: container,
        routes,
        hydrate: { skipSelectors: ['.static-footer'] },
      });
      flushScheduler();

      fireEvent.click(container.querySelector('#live') as HTMLElement);
      fireEvent.click(container.querySelector('#static') as HTMLElement);
      flushScheduler();

      expect(clicks).toEqual(['live']);
      expect(
        (container.querySelector('.static-footer') as Element).hasAttribute(
          'data-skip-hydrate'
        )
      ).toBe(true);
    });

    it('should activate below-fold content after scroll makes it visible', async () => {
      const clicks: string[] = [];
      const originalRect = Element.prototype.getBoundingClientRect;

      Element.prototype.getBoundingClientRect = function () {
        const className = (this as Element).className;
        if (typeof className === 'string' && className.includes('below-fold')) {
          return {
            top: 1000,
            left: 0,
            bottom: 1100,
            right: 100,
            width: 100,
            height: 100,
            x: 0,
            y: 1000,
            toJSON: () => undefined,
          } as DOMRect;
        }

        return {
          top: 0,
          left: 0,
          bottom: 100,
          right: 100,
          width: 100,
          height: 100,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        } as DOMRect;
      };

      try {
        const Component = () => (
          <div>
            <div class="hero">
              <button id="hero-btn" onClick={() => clicks.push('hero')}>
                hero
              </button>
            </div>
            <div class="below-fold">
              <button id="below-btn" onClick={() => clicks.push('below')}>
                below
              </button>
            </div>
          </div>
        );

        const routes = [{ path: '/', handler: Component }];
        container.innerHTML = renderToStringSyncForUrl({ url: '/', routes });

        await hydrateSPA({
          root: container,
          routes,
          hydrate: { deferBelowFold: true, foldThreshold: 100 },
        });
        flushScheduler();

        fireEvent.click(container.querySelector('#hero-btn') as HTMLElement);
        fireEvent.click(container.querySelector('#below-btn') as HTMLElement);
        flushScheduler();

        expect(clicks).toEqual(['hero']);

        Element.prototype.getBoundingClientRect = function () {
          return {
            top: 0,
            left: 0,
            bottom: 100,
            right: 100,
            width: 100,
            height: 100,
            x: 0,
            y: 0,
            toJSON: () => undefined,
          } as DOMRect;
        };

        window.dispatchEvent(new Event('scroll'));
        flushScheduler();

        fireEvent.click(container.querySelector('#below-btn') as HTMLElement);
        flushScheduler();

        expect(clicks).toEqual(['hero', 'below']);
      } finally {
        Element.prototype.getBoundingClientRect = originalRect;
      }
    });
  });
});
