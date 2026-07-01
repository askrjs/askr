import { describe, expect, it, vi } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { globalScheduler } from '../../../src/runtime/scheduler';

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

  it('should preserve a newer success when an older success resolves late', async () => {
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

      resolvers[1]('newer');
      await settleResourceWork();
      expect(container.textContent).toBe('newer');

      resolvers[0]('older');
      await settleResourceWork();
      expect(container.textContent).toBe('newer');
    } finally {
      cleanup();
    }
  });

  it('should preserve a newer success when an older rejection resolves late', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const settlements: Array<{
      resolve: (value: string) => void;
      reject: (error: Error) => void;
    }> = [];

    const App = (): JSXElement => {
      const result = resource(
        () =>
          new Promise<string>((resolve, reject) => {
            settlements.push({ resolve, reject });
          }),
        []
      );

      return (
        <button onClick={() => result.refresh()}>
          {result.error?.message ??
            result.value ??
            (result.pending ? 'loading' : 'empty')}
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
      expect(settlements.length).toBe(2);

      settlements[1].resolve('newer');
      await settleResourceWork();
      expect(container.textContent).toBe('newer');

      settlements[0].reject(new Error('older failed'));
      await settleResourceWork();

      expect(container.textContent).toBe('newer');
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
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

  it('should expose pending ready refresh and error transitions', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const settlements: Array<{
      resolve: (value: string) => void;
      reject: (error: Error) => void;
    }> = [];

    const App = (): JSXElement => {
      const result = resource(
        () =>
          new Promise<string>((resolve, reject) => {
            settlements.push({ resolve, reject });
          }),
        []
      );

      return (
        <button onClick={() => result.refresh()}>
          {result.pending ? 'pending' : 'settled'}|{result.value ?? 'none'}|
          {result.error?.message ?? 'no-error'}
        </button>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(container.textContent).toBe('pending|none|no-error');
      expect(settlements.length).toBe(1);

      settlements[0].resolve('ready');
      await settleResourceWork();
      expect(container.textContent).toBe('settled|ready|no-error');

      (container.firstElementChild as HTMLButtonElement).click();
      flushScheduler();
      expect(settlements.length).toBe(2);
      expect(container.textContent).toBe('pending|ready|no-error');

      settlements[1].reject(new Error('refresh failed'));
      await settleResourceWork();

      expect(container.textContent).toBe('settled|ready|refresh failed');
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
      cleanup();
    }
  });

  it('should start only the newest loader once when deps change before post drain', async () => {
    const calls: string[] = [];
    let id!: ReturnType<typeof state<string>>;

    const App = (): JSXElement => {
      id = state('a');
      const result = resource(() => {
        calls.push(id());
        return `user:${id()}`;
      }, [id()]);

      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(calls).toEqual(['a']);

      id.set('b');
      globalScheduler.enqueue(() => id.set('c'));
      flushScheduler();

      expect(calls).toEqual(['a', 'c']);
    } finally {
      cleanup();
    }
  });
});
