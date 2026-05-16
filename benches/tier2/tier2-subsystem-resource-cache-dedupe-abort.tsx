import { bench, describe, expect } from 'vite-plus/test';
import { state } from '../../src';
import { cleanupApp, createIsland } from '../../src/boot';
import { createQuery } from '../../src/resources';
import {
  createSelectionToggle,
  tier2BenchOptions,
  type BenchToggle,
} from '../shared/_shared';
import { flushScheduler } from '../../test-utils/render/test-renderer';

type QueryName = 'acme' | 'umbrella';

type QueryStats = {
  starts: number;
  aborts: number;
};

type QueryPayload = {
  query: QueryName;
};

const queryStats: QueryStats = {
  starts: 0,
  aborts: 0,
};

let queryState: ReturnType<typeof state<QueryName>> | null = null;

function createResourceContainer(): {
  container: HTMLDivElement;
  cleanup(): void;
} {
  const container = document.createElement('div');
  document.body.appendChild(container);

  return {
    container,
    cleanup() {
      cleanupApp(container);

      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    },
  };
}

function createPendingQueryFetch(query: QueryName) {
  return ({ signal }: { signal: AbortSignal }) => {
    queryStats.starts += 1;

    return new Promise<QueryPayload>((_resolve, reject) => {
      const abortError = new Error(`Query aborted: ${query}`);
      abortError.name = 'AbortError';

      const onAbort = () => {
        queryStats.aborts += 1;
        reject(abortError);
      };

      if (signal.aborted) {
        onAbort();
        return;
      }

      signal.addEventListener('abort', onAbort, { once: true });
    });
  };
}

function QueryPane({ query, label }: { query: QueryName; label: string }) {
  const results = createQuery({
    key: `customer-search:${query}`,
    fetch: createPendingQueryFetch(query),
  });

  return (
    <section aria-label={label} data-query={query}>
      <p data-testid={`${label}-query`}>{query}</p>
      <p data-testid={`${label}-status`}>
        {results.loading ? 'loading' : (results.data?.query ?? 'ready')}
      </p>
    </section>
  );
}

function ResourceCacheApp() {
  queryState = state<QueryName>('acme');

  return (
    <section aria-label="resource-cache-bench">
      <QueryPane label="primary" query={queryState()} />
      <QueryPane label="secondary" query={queryState()} />
    </section>
  );
}

describe('tier2 subsystem resource cache dedupe abort', () => {
  let cleanup: (() => void) | null = null;
  let queryToggle: BenchToggle<QueryName> | null = null;

  bench(
    'switch a deduped query key and abort the stale fetch',
    () => {
      queryState!.set(queryToggle!.next());
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        queryStats.starts = 0;
        queryStats.aborts = 0;

        const result = createResourceContainer();
        cleanup = result.cleanup;
        createIsland({ root: result.container, component: ResourceCacheApp });
        flushScheduler();

        queryToggle = createSelectionToggle('acme', 'umbrella', 'first');

        expect(queryStats.starts).toBe(1);
        expect(queryStats.aborts).toBe(0);
        expect(
          result.container.querySelector('[data-testid="primary-query"]')
            ?.textContent
        ).toBe('acme');
        expect(
          result.container.querySelector('[data-testid="secondary-query"]')
            ?.textContent
        ).toBe('acme');
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        queryState = null;
        queryToggle = null;
      },
    }
  );
});
