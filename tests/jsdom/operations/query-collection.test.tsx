import { describe, expect, it } from 'vite-plus/test';
import type { JSXElement } from '../../../src/jsx/types';
import {
  createDataRuntime,
  createQueryCollection,
  defineQuery,
  type QueryCollection,
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

describe('query collections', () => {
  it('should bound dynamic keyed work and aggregate query entries', async () => {
    const runtime = createDataRuntime();
    const started: string[] = [];
    const resolvers = new Map<string, (value: { database: string }) => void>();
    let active = 0;
    let maxActive = 0;
    let collection!: QueryCollection<
      { database: string },
      { database: string },
      string
    >;

    const schemaByDatabase = defineQuery({
      key: ({ database }: { database: string }) => `schemas:${database}`,
      fetch: ({ database, signal }) => {
        started.push(database);
        active += 1;
        maxActive = Math.max(maxActive, active);

        return new Promise<{ database: string }>((resolve, reject) => {
          const abort = () => {
            active -= 1;
            reject(new DOMException('Aborted', 'AbortError'));
          };
          signal.addEventListener('abort', abort, { once: true });
          resolvers.set(database, (value) => {
            signal.removeEventListener('abort', abort);
            active -= 1;
            resolve(value);
          });
        });
      },
    });

    const App = (): JSXElement => {
      collection = createQueryCollection({
        runtime,
        query: schemaByDatabase,
        inputs: () => [
          { database: 'postgres' },
          { database: 'analytics' },
          { database: 'warehouse' },
        ],
        key: ({ database }) => database,
        concurrency: 2,
      });

      return <div>{collection.entries.map((entry) => entry.key).join(',')}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settle();

      expect(container.textContent).toBe('postgres,analytics,warehouse');
      expect(started).toEqual(['postgres', 'analytics']);
      expect(maxActive).toBe(2);
      expect(collection.loading).toBe(true);
      expect(collection.settled).toBe(false);
      expect(collection.results.size).toBe(0);

      resolvers.get('postgres')?.({ database: 'postgres' });
      await settle();

      expect(started).toEqual(['postgres', 'analytics', 'warehouse']);
      expect(maxActive).toBe(2);

      resolvers.get('analytics')?.({ database: 'analytics' });
      resolvers.get('warehouse')?.({ database: 'warehouse' });
      await settle();

      expect(collection.loading).toBe(false);
      expect(collection.settled).toBe(true);
      expect([...collection.results]).toEqual([
        ['postgres', { database: 'postgres' }],
        ['analytics', { database: 'analytics' }],
        ['warehouse', { database: 'warehouse' }],
      ]);
      expect(collection.errors.size).toBe(0);
      expect(collection.get('analytics')?.query.data).toEqual({
        database: 'analytics',
      });
    } finally {
      cleanup();
    }
  });
});
