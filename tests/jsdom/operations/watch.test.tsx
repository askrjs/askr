import { describe, expect, it, vi } from 'vite-plus/test';
import { cleanupApp, createIsland } from '@askrjs/askr/boot';
import { ErrorBoundary } from '@askrjs/askr/components';
import { derive, state, type State } from '@askrjs/askr';
import { watch } from '@askrjs/askr/resources';
import { renderToString } from '@askrjs/askr/ssr';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('watch()', () => {
  it('should run after commit and coalesce source changes by committed value', () => {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;
    const observations: Array<{
      value: number;
      previous: number | undefined;
      initial: boolean;
      committed: boolean;
    }> = [];

    const App = () => {
      count = state(0);
      watch(count, (value, context) => {
        observations.push({
          value,
          previous: context.previous,
          initial: context.initial,
          committed: container.textContent === String(value),
        });
      });
      return <output>{() => count()}</output>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(observations).toEqual([
      { value: 0, previous: undefined, initial: true, committed: true },
    ]);

    count.set(1);
    count.set(2);
    count.set(2);
    flushScheduler();
    expect(observations).toEqual([
      { value: 0, previous: undefined, initial: true, committed: true },
      { value: 2, previous: 0, initial: false, committed: true },
    ]);

    cleanupApp(container);
    cleanup();
  });

  it('should preserve tuple inference and abort then clean up replaced generations', () => {
    const { container, cleanup } = createTestContainer();
    let enabled!: State<boolean>;
    let count!: State<number>;
    const events: string[] = [];

    const App = () => {
      enabled = state(false);
      count = state(1);
      const doubled = derive(() => count() * 2);
      watch(
        [enabled, doubled] as const,
        ([nextEnabled, nextCount], context) => {
          const enabledValue: boolean = nextEnabled;
          const countValue: number = nextCount;
          events.push(
            `run:${enabledValue}:${countValue}:${context.signal.aborted}`
          );
          context.signal.addEventListener('abort', () => events.push('abort'));
          return () => events.push('cleanup');
        }
      );
      return <output>{() => `${enabled()}:${doubled()}`}</output>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    enabled.set(true);
    count.set(2);
    flushScheduler();
    cleanupApp(container);

    expect(events).toEqual([
      'run:false:2:false',
      'abort',
      'cleanup',
      'run:true:4:false',
      'abort',
      'cleanup',
    ]);
    cleanup();
  });

  it('should not run for unchanged values and should start fresh after remount', () => {
    const { container, cleanup } = createTestContainer();
    const observed = vi.fn();
    let source!: State<{ id: number }>;

    const App = () => {
      source = state({ id: 1 });
      watch(source, observed);
      return <p>{'ready'}</p>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const current = source();
    source.set(current);
    flushScheduler();
    expect(observed).toHaveBeenCalledTimes(1);

    cleanupApp(container);
    createIsland({ root: container, component: App });
    flushScheduler();
    expect(observed).toHaveBeenCalledTimes(2);
    cleanup();
  });

  it('should remain inert during SSR', () => {
    const observed = vi.fn();
    const App = () => {
      const source = state('server');
      watch(source, observed);
      return <p>{source()}</p>;
    };

    expect(renderToString(() => <App />)).toContain('server');
    expect(observed).not.toHaveBeenCalled();
  });

  it('should route callback failures to the owning error boundary', () => {
    const { container, cleanup } = createTestContainer();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const BrokenWatch = () => {
      const source = state('ready');
      watch(source, () => {
        throw new Error('watch callback failed');
      });
      return <p>{source()}</p>;
    };
    const App = () => (
      <ErrorBoundary fallback={<p id="watch-fallback">{'recovered'}</p>}>
        <BrokenWatch />
      </ErrorBoundary>
    );

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).not.toThrow();
    expect(container.querySelector('#watch-fallback')?.textContent).toBe(
      'recovered'
    );
    errorSpy.mockRestore();
    cleanup();
  });

  it('should bound reactive cycles with an actionable diagnostic', () => {
    const { container, cleanup } = createTestContainer();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const CyclicWatch = () => {
      const source = state(0);
      watch(source, (value) => source.set(value + 1));
      return <p>{() => source()}</p>;
    };
    const App = () => (
      <ErrorBoundary fallback={<p id="cycle-fallback">{'bounded'}</p>}>
        <CyclicWatch />
      </ErrorBoundary>
    );

    expect(() => {
      createIsland({ root: container, component: App });
      flushScheduler();
    }).not.toThrow();
    expect(container.querySelector('#cycle-fallback')?.textContent).toBe(
      'bounded'
    );
    expect(errorSpy).toHaveBeenCalledWith(
      '[Askr] ErrorBoundary caught render error:',
      expect.objectContaining({
        message: expect.stringMatching(/reactive cycle/i),
      })
    );
    errorSpy.mockRestore();
    cleanup();
  });
});
