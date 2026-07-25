import {
  resetRouteState,
  currentRouteManifest,
  currentRouteList,
  currentRouteRegistry,
  routeRegistryFromTable,
} from '../../router-test-utils';
/**
 * SSR Event Handling Tests
 *
 * Validates that event handlers are client-only (not serialized to HTML) and
 * attach correctly during hydration.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  createTestContainer,
  flushScheduler,
  fireEvent,
} from '../../../test-utils/render/test-renderer';
import { hydrateSPA } from '../../../src/boot';
import { renderToString } from '../../../src/ssr';
import { state } from '../../../src/runtime/state';
import { jsx } from '../../../src/jsx-runtime';

describe('SSR event handling', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  /* eslint-disable no-console */
  describe('event handler serialization', () => {
    it('should NOT serialize onClick attributes to HTML', () => {
      const Component = () => (
        <button id="btn" onClick={() => console.log('clicked')}>
          Click
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });

      // Event handlers should NOT be in the HTML
      expect(html).not.toContain('onclick');
      expect(html).not.toContain('onClick');
      expect(html).toContain('<button');
      expect(html).toContain('id="btn"');
    });

    it('should NOT serialize onInput attributes to HTML', () => {
      const Component = () => (
        <input id="input" onInput={() => console.log('input')} />
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });

      expect(html).not.toContain('oninput');
      expect(html).not.toContain('onInput');
      expect(html).toContain('<input');
    });

    it('should NOT serialize onChange attributes to HTML', () => {
      const Component = () => (
        <select id="select" onChange={() => console.log('changed')}>
          <option>A</option>
        </select>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });

      expect(html).not.toContain('onchange');
      expect(html).not.toContain('onChange');
      expect(html).toContain('<select');
    });

    it('should serialize non-event attributes correctly', () => {
      const Component = () => (
        <button
          id="btn"
          class="button-primary"
          data-test="value"
          onClick={() => console.log('clicked')}
        >
          Click
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });

      // Non-event attributes should be preserved
      expect(html).toContain('id="btn"');
      expect(html).toContain('class="button-primary"');
      expect(html).toContain('data-test="value"');
      // Event handler should not be
      expect(html).not.toContain('onclick');
    });

    it('should reject invalid element and attribute names and every on* casing', () => {
      const events = {
        onclick: 'alert(1)',
        ONLOAD: 'alert(2)',
        oNerror: 'alert(3)',
      } as Record<string, unknown>;
      const html = renderToString({
        url: '/',
        routes: [{ path: '/', handler: () => jsx('div', events) }],
      });
      expect(html).not.toMatch(/\son(?:click|load|error)=/i);

      expect(() =>
        renderToString({
          url: '/',
          routes: [{ path: '/', handler: () => jsx('div><script', {}) }],
        })
      ).toThrow('Invalid SSR element name');
      expect(() =>
        renderToString({
          url: '/',
          routes: [
            {
              path: '/',
              handler: () => jsx('div', { 'bad name': 'value' }),
            },
          ],
        })
      ).toThrow('Invalid SSR attribute name');
    });
  });
  /* eslint-enable no-console */

  describe('event listener attachment during hydration', () => {
    it('should attach click listeners during hydration', async () => {
      let clicks = 0;
      const Component = () => (
        <button id="btn" onClick={() => (clicks += 1)}>
          Click me
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      // Verify no inline handler in HTML
      const btnBefore = container.querySelector('#btn') as HTMLButtonElement;
      expect(btnBefore.onclick).toBeNull();

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      // Click should work after hydration
      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();

      expect(clicks).toBe(1);
    });

    it('should attach input listeners during hydration', async () => {
      let value = '';
      const Component = () => (
        <input
          id="input"
          onInput={(e: Event) => (value = (e.target as HTMLInputElement).value)}
        />
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      fireEvent.input(
        container.querySelector('#input') as HTMLInputElement,
        'test'
      );
      flushScheduler();

      expect(value).toBe('test');
    });

    it('should attach multiple event types during hydration', async () => {
      const events: string[] = [];
      const Component = () => (
        <button
          id="btn"
          onClick={() => events.push('click')}
          onMouseOver={() => events.push('mouseover')}
        >
          Multi
        </button>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLButtonElement;
      fireEvent.click(btn);
      btn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      flushScheduler();

      expect(events).toEqual(['click', 'mouseover']);
    });
  });

  describe('event listeners with state after hydration', () => {
    it('should update DOM when event handler modifies state', async () => {
      const Component = () => {
        const count = state(0);
        return (
          <div>
            <button id="btn" onClick={() => count.set(count() + 1)}>
              Increment
            </button>
            <span id="count">{count()}</span>
          </div>
        );
      };

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      // Verify server-rendered HTML contains initial state
      expect(container.querySelector('#count')?.textContent).toBe('0');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      // Should preserve server state after hydration
      expect(container.querySelector('#count')?.textContent).toBe('0');

      fireEvent.click(container.querySelector('#btn') as HTMLElement);
      flushScheduler();

      expect(container.querySelector('#count')?.textContent).toBe('1');
    });

    it('should handle rapid clicks after hydration', async () => {
      const Component = () => {
        const count = state(0);
        return (
          <div>
            <button id="btn" onClick={() => count.set(count() + 1)}>
              Count: {count()}
            </button>
          </div>
        );
      };

      const routes = [{ path: '/', handler: Component }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      const btn = container.querySelector('#btn') as HTMLElement;
      for (let i = 0; i < 5; i++) {
        fireEvent.click(btn);
      }
      flushScheduler();

      expect(btn.textContent).toBe('Count: 5');
    });
  });

  describe('nested components with event handlers', () => {
    it('should attach listeners in nested components', async () => {
      const clicks: string[] = [];

      const Child = ({ id }: { id: string }) => (
        <button id={id} onClick={() => clicks.push(id)}>
          Child {id}
        </button>
      );

      const Parent = () => (
        <div>
          <Child id="child1" />
          <Child id="child2" />
          <Child id="child3" />
        </div>
      );

      const routes = [{ path: '/', handler: Parent }];
      const html = renderToString({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable(routes),
      });
      flushScheduler();

      fireEvent.click(container.querySelector('#child1') as HTMLElement);
      fireEvent.click(container.querySelector('#child2') as HTMLElement);
      fireEvent.click(container.querySelector('#child3') as HTMLElement);
      flushScheduler();

      expect(clicks).toEqual(['child1', 'child2', 'child3']);
    });
  });
});
