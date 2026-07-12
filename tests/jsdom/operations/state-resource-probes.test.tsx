import { describe, expect, it } from 'vite-plus/test';
import { derive, state } from '../../../src/index';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
}

describe('state/resource correctness probes', () => {
  it('should not schedule component work when resource resolves after unmount', async () => {
    let resolveLater!: (value: string) => void;
    let renders = 0;

    const App = (): JSXElement => {
      renders += 1;
      const result = resource(
        () =>
          new Promise<string>((resolve) => {
            resolveLater = resolve;
          }),
        []
      );
      return <div data-testid="out">{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(renders).toBe(1);

      cleanup();
      const rendersAtUnmount = renders;

      resolveLater('late');
      await settleResourceWork();

      expect(renders).toBe(rendersAtUnmount);
      expect(getSchedulerState().queueLength).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('should not start resource work when refresh() is called after unmount', async () => {
    let startCount = 0;
    let refresh!: () => void;

    const App = (): JSXElement => {
      const result = resource(async () => {
        startCount += 1;
        return `run:${startCount}`;
      }, []);
      refresh = result.refresh;
      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(startCount).toBe(1);
      expect(container.textContent).toBe('run:1');

      cleanup();
      refresh();
      await settleResourceWork();

      expect(startCount).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should update UI when only a derive() reads the changed state', () => {
    let countState!: ReturnType<typeof state<number>>;

    const App = (): JSXElement => {
      countState = state(0);
      const label = derive(() => `value:${countState()}`);
      return <div data-testid="out">{label()}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('value:0');

      countState.set(1);
      flushScheduler();

      expect(container.textContent).toBe('value:1');
    } finally {
      cleanup();
    }
  });

  it('should clear resource error when deps change triggers a new fetch', async () => {
    let id!: ReturnType<typeof state<string>>;
    let resolveSecond!: (value: string) => void;

    const App = (): JSXElement => {
      id = state('fail');
      const result = resource(
        () =>
          id() === 'fail'
            ? Promise.reject(new Error('first failed'))
            : new Promise<string>((resolve) => {
                resolveSecond = resolve;
              }),
        [id()]
      );

      if (result.error) {
        return <div data-testid="out">err:{result.error.message}</div>;
      }
      return (
        <div data-testid="out">
          {result.pending ? 'loading' : (result.value ?? 'empty')}
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('err:first failed');

      id.set('ok');
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('loading');

      resolveSecond('recovered');
      await settleResourceWork();
      expect(container.textContent).toBe('recovered');
    } finally {
      cleanup();
    }
  });

  it('should read the latest state value inside a functional setter after a prior setter in the same tick', () => {
    let count!: ReturnType<typeof state<number>>;

    const App = (): JSXElement => {
      count = state(0);
      return <div data-testid="out">{count()}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      count.set((prev) => prev + 1);
      count.set((prev) => prev + 10);
      flushScheduler();

      expect(container.textContent).toBe('11');
      expect(count()).toBe(11);
    } finally {
      cleanup();
    }
  });

  it('should not run a deps-driven resource start after unmount clears notifyUpdate', async () => {
    let dep!: ReturnType<typeof state<string>>;
    let startCount = 0;

    const App = (): JSXElement => {
      dep = state('a');
      resource(() => {
        startCount += 1;
        return Promise.resolve(`value:${dep()}`);
      }, [dep()]);
      return <div data-testid="out">ok</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(startCount).toBe(1);

      dep.set('b');
      cleanup();
      flushScheduler();
      await settleResourceWork();

      expect(startCount).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should update derived resource projection after the resource resolves', async () => {
    let resolveUser!: (value: { name: string }) => void;

    const App = (): JSXElement => {
      const user = resource<{ name: string }>(
        () =>
          new Promise<{ name: string }>((resolve) => {
            resolveUser = resolve;
          }),
        []
      );
      const name = derive(user, (value) => value?.name ?? 'missing');
      return <div data-testid="out">{name()}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('missing');

      resolveUser({ name: 'Ada' });
      await settleResourceWork();
      expect(container.textContent).toBe('Ada');
    } finally {
      cleanup();
    }
  });

  it('should update inline resource projection after the resource resolves via component re-render', async () => {
    let resolveUser!: (value: { name: string }) => void;

    const App = (): JSXElement => {
      const user = resource<{ name: string }>(
        () =>
          new Promise<{ name: string }>((resolve) => {
            resolveUser = resolve;
          }),
        []
      );
      const name = derive(() => user.value?.name ?? 'missing');
      return <div data-testid="out">{name()}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('missing');

      resolveUser({ name: 'Grace' });
      await settleResourceWork();
      expect(container.textContent).toBe('Grace');
    } finally {
      cleanup();
    }
  });
});
