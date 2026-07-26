import { bench, describe, expect } from 'vite-plus/test';
import { cleanupApp, createIsland } from '../../src/boot';
import { stream } from '../../src/resources';
import { tier2BenchOptions } from '../shared/_shared';
import { flushScheduler } from '../../test-utils/render/test-renderer';

class BenchStream implements AsyncIterable<number> {
  private nextResolve: ((result: IteratorResult<number>) => void) | null = null;
  private value = 0;

  [Symbol.asyncIterator](): AsyncIterator<number> {
    return {
      next: () =>
        new Promise<IteratorResult<number>>((resolve) => {
          this.nextResolve = resolve;
        }),
      return: () => {
        this.nextResolve?.({ done: true, value: undefined });
        this.nextResolve = null;
        return Promise.resolve({ done: true, value: undefined });
      },
    };
  }

  emit(): void {
    this.value += 1;
    this.nextResolve?.({ done: false, value: this.value });
    this.nextResolve = null;
  }
}

describe('tier2 subsystem stream latest value', () => {
  let source: BenchStream | null = null;
  let cleanup: (() => void) | null = null;

  bench(
    'emit one stream item and commit its DOM update',
    async () => {
      source!.emit();
      await Promise.resolve();
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        source = new BenchStream();
        const container = document.createElement('div');
        document.body.appendChild(container);
        cleanup = () => {
          cleanupApp(container);
          container.remove();
        };
        createIsland({
          root: container,
          component: () => {
            const result = stream(() => source!);
            return <output>{result.value ?? 0}</output>;
          },
        });
        flushScheduler();
        expect(container.textContent).toBe('0');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        source = null;
      },
    }
  );
});
