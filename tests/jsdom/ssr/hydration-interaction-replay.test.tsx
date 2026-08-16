import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('hydration interaction replay', () => {
  it('should replay a click fired during plain root hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let clicks = 0;
    const Component = () => (
      <button id="plain-replay" onClick={() => (clicks += 1)}>
        {'plain'}
      </button>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);
    container.innerHTML = renderToString({ url: '/', registry });

    try {
      const hydration = hydrateSPA({ root: container, registry });
      (container.querySelector('#plain-replay') as HTMLButtonElement).click();
      expect(clicks).toBe(0);

      await hydration;
      flushScheduler();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should replay a click fired before idle-deferred hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let clicks = 0;
    const Component = () => (
      <button id="idle-replay" onClick={() => (clicks += 1)}>
        {'idle'}
      </button>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);
    container.innerHTML = renderToString({ url: '/', registry });

    try {
      const hydration = hydrateSPA({
        root: container,
        registry,
        hydrate: { deferUntilIdle: true },
      });
      (container.querySelector('#idle-replay') as HTMLButtonElement).click();
      expect(clicks).toBe(0);

      await hydration;
      flushScheduler();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should activate and replay inside a below-fold hydration boundary', async () => {
    const { container, cleanup } = createTestContainer();
    const originalRect = Element.prototype.getBoundingClientRect;
    let clicks = 0;
    const Component = () => (
      <main>
        <section class="below-fold-replay">
          <button id="below-fold-replay" onClick={() => (clicks += 1)}>
            {'below fold'}
          </button>
        </section>
      </main>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);
    Element.prototype.getBoundingClientRect = function () {
      return {
        top: this.classList.contains('below-fold-replay') ? 1000 : 0,
      } as DOMRect;
    };
    container.innerHTML = renderToString({ url: '/', registry });

    try {
      await hydrateSPA({
        root: container,
        registry,
        hydrate: { deferBelowFold: true, foldThreshold: 100 },
      });
      flushScheduler();
      const boundary = container.querySelector('.below-fold-replay');
      const button = container.querySelector(
        '#below-fold-replay'
      ) as HTMLButtonElement;
      expect(boundary?.hasAttribute('data-skip-hydrate')).toBe(true);

      button.click();
      flushScheduler();

      expect(boundary?.hasAttribute('data-skip-hydrate')).toBe(false);
      expect(clicks).toBe(1);
    } finally {
      Element.prototype.getBoundingClientRect = originalRect;
      cleanup();
    }
  });

  it('should preserve keyboard details and replay each key event once', async () => {
    const { container, cleanup } = createTestContainer();
    const keys: string[] = [];
    const Component = () => (
      <button
        id="keyboard-replay"
        onKeyDown={(event: KeyboardEvent) => keys.push(event.key)}
      >
        {'keyboard'}
      </button>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);
    container.innerHTML = renderToString({ url: '/', registry });

    try {
      const hydration = hydrateSPA({ root: container, registry });
      const button = container.querySelector(
        '#keyboard-replay'
      ) as HTMLButtonElement;
      button.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Enter' })
      );
      expect(keys).toEqual([]);

      await hydration;
      flushScheduler();
      expect(keys).toEqual(['Enter']);

      button.dispatchEvent(
        new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' })
      );
      expect(keys).toEqual(['Enter', 'Escape']);
    } finally {
      cleanup();
    }
  });

  it('should not intercept native events inside permanently skipped content', async () => {
    const { container, cleanup } = createTestContainer();
    let nativeClicks = 0;
    const Component = () => (
      <section class="permanently-static">
        <button id="native-static">{'native static'}</button>
      </section>
    );
    const registry = routeRegistryFromTable([
      { path: '/', handler: Component },
    ]);
    container.innerHTML = renderToString({ url: '/', registry });
    const button = container.querySelector(
      '#native-static'
    ) as HTMLButtonElement;
    button.addEventListener('click', () => (nativeClicks += 1));

    try {
      const hydration = hydrateSPA({
        root: container,
        registry,
        hydrate: { skipSelectors: ['.permanently-static'] },
      });
      button.click();
      expect(nativeClicks).toBe(1);

      await hydration;
      flushScheduler();
      button.click();
      expect(nativeClicks).toBe(2);
    } finally {
      cleanup();
    }
  });
});
