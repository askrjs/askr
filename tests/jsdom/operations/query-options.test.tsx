import { describe, expect, it, vi } from 'vite-plus/test';
import {
  createDataRuntime,
  createQuery,
  defineQuery,
  type Query,
} from '../../../src/data';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

async function settle(): Promise<void> {
  await waitForNextEvaluation();
  flushScheduler();
}

describe('defined query options', () => {
  it('should skip the initial client fetch and support explicit refresh', async () => {
    const runtime = createDataRuntime();
    const fetch = vi.fn(async () => ({ name: 'Ada' }));
    const definition = defineQuery({ key: () => 'options:skip', fetch });
    let query!: Query<{ name: string }>;
    const { container, cleanup } = createTestContainer();

    try {
      createIsland({
        root: container,
        component: () => {
          query = createQuery(definition, undefined, {
            runtime,
            skipInitialFetch: true,
          });
          return <div>{query.data?.name ?? 'waiting'}</div>;
        },
      });
      flushScheduler();
      await settle();

      expect(fetch).not.toHaveBeenCalled();
      expect(container.textContent).toBe('waiting');

      const refreshed = query.refresh();
      flushScheduler();
      await refreshed;
      await settle();

      expect(fetch).toHaveBeenCalledTimes(1);
      expect(container.textContent).toBe('Ada');
    } finally {
      cleanup();
    }
  });

  it.each([undefined, false])(
    'should fetch initially when skipInitialFetch is %s',
    async (skipInitialFetch) => {
      const runtime = createDataRuntime();
      const fetch = vi.fn(async () => ({ name: 'Ada' }));
      const definition = defineQuery({ key: () => 'options:default', fetch });
      const { container, cleanup } = createTestContainer();

      try {
        createIsland({
          root: container,
          component: () => {
            const query = createQuery(definition, undefined, {
              runtime,
              skipInitialFetch,
            });
            return <div>{query.data?.name ?? 'waiting'}</div>;
          },
        });
        flushScheduler();
        await settle();

        expect(fetch).toHaveBeenCalledTimes(1);
        expect(container.textContent).toBe('Ada');
      } finally {
        cleanup();
      }
    }
  );
});
