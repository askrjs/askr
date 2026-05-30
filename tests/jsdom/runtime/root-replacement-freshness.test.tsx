import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src';
import { resource } from '../../../src/resources';
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

describe('root replacement freshness', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should create fresh state when the root component is replaced on the same root', () => {
    let increment!: () => void;

    const OldComponent = () => {
      const count = state(1);
      increment = () => count.set((value) => value + 1);
      return <div>{count()}</div>;
    };

    const NewComponent = () => {
      const count = state(0);
      return <div>{count()}</div>;
    };

    createIsland({ root: container, component: OldComponent });
    flushScheduler();
    expect(container.textContent).toBe('1');

    increment();
    flushScheduler();
    expect(container.textContent).toBe('2');

    createIsland({ root: container, component: NewComponent });
    flushScheduler();

    expect(container.textContent).toBe('0');
  });

  it('should create a fresh resource lifecycle when the root component is replaced on the same root', async () => {
    let oldLoads = 0;
    let newLoads = 0;

    const OldComponent = () => {
      const result = resource(async () => {
        oldLoads += 1;
        return 'old';
      }, []);

      return <div>{result.value ?? 'loading old'}</div>;
    };

    const NewComponent = () => {
      const result = resource(async () => {
        newLoads += 1;
        return 'new';
      }, []);

      return <div>{result.value ?? 'loading new'}</div>;
    };

    createIsland({ root: container, component: OldComponent });
    flushScheduler();
    await settleResourceWork();

    expect(oldLoads).toBe(1);
    expect(container.textContent).toBe('old');

    createIsland({ root: container, component: NewComponent });
    flushScheduler();
    await settleResourceWork();

    expect(newLoads).toBe(1);
    expect(container.textContent).toBe('new');
  });
});
