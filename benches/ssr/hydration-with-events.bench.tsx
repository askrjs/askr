/**
 * Hydration with Event Listeners Benchmark
 *
 * Measures the cost of attaching event listeners during hydration
 * with various listener counts.
 *
 * Expected: Listener attachment cost should scale linearly with count.
 */

import { bench, describe, beforeEach, afterEach } from 'vitest';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { hydrateSPA } from '../../src/boot';
import { renderToStringSyncForUrl } from '../../src/ssr';
import { state } from '../../src/runtime/state';

describe('ssr::hydration::events', () => {
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

  describe('listener attachment cost', () => {
    bench('10 listeners', async () => {
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 10 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });

    bench('100 listeners', async () => {
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });

    bench('1000 listeners', async () => {
      const clicks = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 1000 }, (_, i) => (
            <button key={i} onClick={() => clicks.set(clicks() + 1)}>
              Button {i}
            </button>
          ))}
        </div>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });
  });

  describe('multiple event types', () => {
    bench('100 elements, 3 event types each', async () => {
      const events = state(0);
      const Component = () => (
        <div>
          {Array.from({ length: 100 }, (_, i) => (
            <button
              key={i}
              onClick={() => events.set(events() + 1)}
              onMouseOver={() => events.set(events() + 1)}
              onFocus={() => events.set(events() + 1)}
            >
              Button {i}
            </button>
          ))}
        </div>
      );

      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });
  });

  describe('nested components with listeners', () => {
    bench('10 nested levels, 10 listeners each', async () => {
      const clicks = state(0);

      const Nested = ({ depth }: { depth: number }) => {
        if (depth === 0) {
          return (
            <div>
              {Array.from({ length: 10 }, (_, i) => (
                <button key={i} onClick={() => clicks.set(clicks() + 1)}>
                  Button {i}
                </button>
              ))}
            </div>
          );
        }
        return (
          <div>
            <Nested depth={depth - 1} />
          </div>
        );
      };

      const Component = () => <Nested depth={10} />;
      const routes = [{ path: '/', handler: Component }];
      const html = renderToStringSyncForUrl({ url: '/', routes });
      container.innerHTML = html;

      await hydrateSPA({ root: container, routes });
      flushScheduler();
    });
  });
});
