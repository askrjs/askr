import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '../../../src/boot';
import { renderToString } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('hydration interaction replay', () => {
  let cleanupRoot: Element | undefined;

  afterEach(() => {
    if (cleanupRoot) {
      cleanupApp(cleanupRoot);
      cleanupRoot = undefined;
    }
  });

  it('should replay a click fired during plain root hydration', async () => {
    const { container, cleanup } = createTestContainer();
    cleanupRoot = container;
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
    cleanupRoot = container;
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
    cleanupRoot = container;
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
});
