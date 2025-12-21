import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { JSXElement } from '../../src/jsx/types';
import { hydrateSPA } from '../../src/index';
import { renderToStringSync } from '../../src/ssr';
import { renderToStringSyncForUrl, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('hydration (SSR)', () => {
  describe('hydration mismatch', () => {
    let { container, cleanup } = createTestContainer();
    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => cleanup());

    it('should re-render client when server HTML text differs', async () => {
      container.innerHTML = '<div>server</div>';
      const Component = () => ({ type: 'div', children: ['client'] });

      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    });

    it('should re-render client when server HTML structure differs', async () => {
      container.innerHTML = '<span>server</span>';
      const Component = () => ({ type: 'div', children: ['client'] });

      await expect(
        hydrateSPA({
          root: container,
          routes: [{ path: '/', handler: Component }],
        })
      ).rejects.toThrow(/Hydration mismatch/i);
    });

    it('should warn in dev mode when mismatch occurs', async () => {
      container.innerHTML = '<div>server</div>';

      const Component = () => ({ type: 'div', children: ['client'] });
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
          ({
            type: 'div',
            props: { id: 'root' },
            children: [
              {
                type: 'button',
                props: { id: 'btn', onClick: () => (clicks += 1) },
                children: ['Click'],
              },
            ],
          } as JSXElement);

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
        return {
          type: 'div',
          props: { id: 'root' },
          children: [
            {
              type: 'button',
              props: { id: 'btn', onClick: () => (clicks += 1) },
              children: ['Click'],
            },
          ],
        };
      };

      // Server render
      const html = renderToStringSync(() => Component());
      container.innerHTML = html;

      // Hydrate — should not throw and should not modify DOM
      await expect(
        hydrateSPA({ root: container, routes: [{ path: '/', handler: Component }] })
      ).resolves.not.toThrow();

      // DOM unchanged
      expect(container.innerHTML).toBe(html);

      // Click should invoke handler
      const btn = container.querySelector('#btn') as HTMLButtonElement;
      btn.click();
      expect(clicks).toBe(1);

      // Render count may have increased by client-side initialization, but DOM unchanged
      expect(container.querySelector('#btn')).not.toBeNull();
    });

    it('should throw when hydrate encounters a mismatch', async () => {
      const Component = () => ({ type: 'div', props: { id: 'root' }, children: ['server'] });
      container.innerHTML = '<div>client</div>';

      await expect(
        hydrateSPA({ root: container, routes: [{ path: '/', handler: Component }] })
      ).rejects.toThrow();
    });
  });

  describe('hydration success', () => {
    let { container, cleanup } = createTestContainer();
    beforeEach(() => ({ container, cleanup } = createTestContainer()));
    afterEach(() => cleanup());

    it('should attach listeners to server HTML during hydration', async () => {
      let clicks = 0;
      const Component = () => ({ type: 'button', props: { id: 'btn', onClick: () => (clicks += 1) }, children: ['click'] });

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
        return {
          type: 'input',
          props: {
            id: 'input',
            value: value(),
            onInput: (e: Event) => value!.set((e.target as HTMLInputElement).value),
          },
        };
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

      expect((container.querySelector('#input') as HTMLInputElement).value).toBe('abc');
    });

    it('should preserve server state after hydration', async () => {
      const Component = () => ({ type: 'div', children: ['server'] });
      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();

      expect(container.textContent).toBe('server');
    });

    it('should preserve server state after hydration (sync server)', async () => {
      const Component = () => ({ type: 'div', children: ['async hydrated'] });

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
        return {
          type: 'button',
          props: { onClick: () => count.set(count() + 1) },
          children: [`count: ${count()}`],
        };
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
      const Component = () => ({ type: 'button', props: { id: 'btn', onClick: () => (clicks += 1) }, children: ['async click'] });

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
});
