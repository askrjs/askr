import { describe, it, expect } from 'vite-plus/test';
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
  await Promise.resolve();
  flushScheduler();
}

describe('resource() dependency-change ordering (B1)', () => {
  // When deps change, a still-in-flight fetch for the OLD deps must never
  // overwrite the value once the NEW deps' fetch is the active generation —
  // even if the old fetch resolves last.
  it('should ignore a stale (old-deps) resolution that arrives after the new-deps fetch', async () => {
    const resolvers = new Map<string, (v: string) => void>();
    let id!: ReturnType<typeof state<string>>;

    const App = (): JSXElement => {
      id = state('a');
      const result = resource(
        () =>
          new Promise<string>((resolve) => {
            resolvers.set(id(), resolve);
          }),
        [id()]
      );
      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.textContent).toBe('loading');
      expect(resolvers.has('a')).toBe(true);

      // Change deps a -> b, triggering a new generation/fetch.
      id.set('b');
      flushScheduler();
      await settleResourceWork();
      expect(resolvers.has('b')).toBe(true);

      // Resolve the NEW deps fetch first.
      resolvers.get('b')!('value:b');
      await settleResourceWork();
      expect(container.textContent).toBe('value:b');

      // Now the OLD deps fetch resolves late: it must be discarded.
      resolvers.get('a')!('value:a');
      await settleResourceWork();
      expect(container.textContent).toBe('value:b');
    } finally {
      cleanup();
    }
  });
});
