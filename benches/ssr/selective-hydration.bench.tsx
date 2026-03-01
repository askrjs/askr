/**
 * Selective Hydration Performance Benchmark
 *
 * Measures time-to-interactive improvements from selective hydration strategies:
 * - deferUntilIdle: Delay hydration until browser idle
 * - deferBelowFold: Skip off-screen content initially
 * - skipSelectors: Exclude specific elements
 *
 * Expected: Selective strategies reduce initial hydration cost and improve TTI.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { hydrateSPA } from '../../src/boot';
import { renderToStringSyncForUrl } from '../../src/ssr';
import { state } from '../../src/runtime/state';

describe('ssr::selective-hydration::performance', () => {
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

  // Large page with above-fold and below-fold content
  const LargePage = () => {
    const clicks = state(0);
    return (
      <div>
        {/* Above-fold content */}
        <div id="above-fold" style="height: 600px;">
          <h1>Above Fold</h1>
          {Array.from({ length: 20 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>

        {/* Below-fold content */}
        <div id="below-fold" style="height: 3000px; margin-top: 1000px;">
          <h1>Below Fold</h1>
          {Array.from({ length: 100 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i + 20}
            </button>
          ))}
        </div>
      </div>
    );
  };

  describe('full hydration baseline', () => {
    bench('full hydration (120 buttons)', async () => {
      const routes = [{ path: '/', handler: LargePage }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });
  });

  describe('deferUntilIdle', () => {
    bench('hydration deferred until idle', async () => {
      const routes = [{ path: '/', handler: LargePage }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: { deferUntilIdle: true },
      });
      flushScheduler();
    });
  });

  describe('deferBelowFold', () => {
    bench('skip below-fold content (100 buttons deferred)', async () => {
      const routes = [{ path: '/', handler: LargePage }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: { deferBelowFold: true, foldThreshold: 800 },
      });
      flushScheduler();
    });
  });

  describe('skipSelectors', () => {
    bench('skip specific sections (#below-fold)', async () => {
      const routes = [{ path: '/', handler: LargePage }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: { skipSelectors: ['#below-fold', '#below-fold *'] },
      });
      flushScheduler();
    });
  });

  describe('combined strategies', () => {
    bench('deferUntilIdle + deferBelowFold', async () => {
      const routes = [{ path: '/', handler: LargePage }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: {
          deferUntilIdle: true,
          deferBelowFold: true,
          foldThreshold: 800,
        },
      });
      flushScheduler();
    });
  });

  // Realistic scenario: blog post with heavy footer
  describe('realistic blog post', () => {
    const BlogPost = () => {
      const likes = state(0);
      return (
        <div>
          <article style="height: 800px;">
            <h1>Blog Post Title</h1>
            <p>Content...</p>
            <button onClick={() => likes.set(likes() + 1)}>
              Like ({likes()})
            </button>
          </article>

          <footer style="height: 2000px; margin-top: 1200px;">
            <h2>Comments (100)</h2>
            {Array.from({ length: 100 }, (_, i) => (
              <div key={i} class="comment">
                <button onClick={() => likes.set(likes() + 1)}>Like</button>
                <span>Comment {i}</span>
              </div>
            ))}
          </footer>
        </div>
      );
    };

    bench('baseline: full hydration', async () => {
      const routes = [{ path: '/', handler: BlogPost }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });

    bench('optimized: defer footer', async () => {
      const routes = [{ path: '/', handler: BlogPost }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: {
          deferBelowFold: true,
          foldThreshold: 1000,
        },
      });
      flushScheduler();
    });

    bench('optimized: defer until idle + skip footer', async () => {
      const routes = [{ path: '/', handler: BlogPost }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({
        root: container,
        routes,
        hydrate: {
          deferUntilIdle: true,
          skipSelectors: ['footer', 'footer *'],
        },
      });
      flushScheduler();
    });
  });
});
