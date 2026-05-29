import { describe, it, expect } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
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

describe('resource() late resolution after unmount (B5)', () => {
  // A promise that resolves AFTER the component unmounts must be inert: no
  // throw, and no late snapshot/DOM mutation.
  it('should not throw or mutate when a fetch resolves after unmount', async () => {
    let resolveFetch!: (v: string) => void;
    let snapshot: { value: string | null } | null = null;

    const App = (): JSXElement => {
      const result = resource<string>(
        () =>
          new Promise<string>((resolve) => {
            resolveFetch = resolve;
          }),
        []
      );
      snapshot = result;
      return <div>{result.value ?? 'loading'}</div>;
    };

    const { container, cleanup } = createTestContainer();
    createIsland({ root: container, component: App });
    flushScheduler();
    await settleResourceWork();
    expect(container.textContent).toBe('loading');
    expect(snapshot!.value).toBe(null);

    // Unmount the component (aborts the in-flight fetch, nulls notifyUpdate).
    cleanup();

    // The fetch resolves late. The generation/controller guards in ResourceCell
    // must make this a no-op: no throw, value stays null.
    expect(() => resolveFetch('late')).not.toThrow();
    await settleResourceWork();

    expect(snapshot!.value).toBe(null);
  });
});
