import { describe, expect, it, vi } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
  flushScheduler();
}

describe('resource coverage edges', () => {
  it('should restart resource work when dependencies change', async () => {
    const calls: string[] = [];

    const App = (): JSXElement => {
      const id = state('a');
      const result = resource(async () => {
        calls.push(id());
        return `user:${id()}`;
      }, [id()]);

      return (
        <button onClick={() => id.set('b')}>
          {result.value ?? (result.pending ? 'loading' : 'empty')}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();

      expect(container.textContent).toBe('user:a');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settleResourceWork();

      expect(calls).toEqual(['a', 'b']);
      expect(container.textContent).toBe('user:b');
    } finally {
      cleanup();
    }
  });

  it('should ignore stale resource results after refresh starts a newer generation', async () => {
    const resolvers: Array<(value: string) => void> = [];

    const App = (): JSXElement => {
      const result = resource(
        () =>
          new Promise<string>((resolve) => {
            resolvers.push(resolve);
          }),
        []
      );

      return (
        <button onClick={() => result.refresh()}>
          {result.value ?? (result.pending ? 'loading' : 'empty')}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('loading');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      expect(resolvers.length).toBe(2);

      resolvers[0]('old');
      await settleResourceWork();
      expect(container.textContent).toBe('loading');

      resolvers[1]('new');
      await settleResourceWork();
      expect(container.textContent).toBe('new');
    } finally {
      cleanup();
    }
  });

  it('should recover from an error after refresh succeeds', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let attempt = 0;

    const App = (): JSXElement => {
      const result = resource(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new Error('first failed');
        }
        return 'recovered';
      }, []);

      return (
        <button onClick={() => result.refresh()}>
          {result.error?.message ?? result.value ?? 'loading'}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();

      expect(container.textContent).toBe('first failed');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      await settleResourceWork();

      expect(container.textContent).toBe('recovered');
    } finally {
      errorSpy.mockRestore();
      cleanup();
    }
  });
});
