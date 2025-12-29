import { describe, it, expect } from 'vitest';
import { resource } from '../../src/resources';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import type { JSXElement } from '../../src/jsx/types';
import { createIsland } from '../helpers/create-island';

describe('resource() (unified async primitive) — gaps', () => {
  it('should execute resource when component mounts', async () => {
    const calls: Array<string> = [];

    async function fetchUser(id: string) {
      calls.push(`fetch:${id}`);
      return { name: 'A' };
    }

    function App(): JSXElement {
      // Spec: this must NOT execute fetchUser during render.
      resource(() => fetchUser('123'), ['123']);
      return { type: 'div', props: { children: ['ok'] } };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      // Allow any mount-triggered work to run.
      await waitForNextEvaluation();
      flushScheduler();

      expect(calls).toEqual(['fetch:123']);
    } finally {
      cleanup();
    }
  });

  it('should expose pending=true when resource has not produced a value', async () => {
    let resolvePromise: (value: unknown) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    async function fetchUser() {
      return promise;
    }

    function App(): JSXElement {
      const result = resource(() => fetchUser(), []);
      return {
        type: 'div',
        props: { children: [result.pending ? 'pending' : 'ready'] },
      };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.textContent).toBe('pending');

      resolvePromise!({ name: 'A' });
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.textContent).toBe('ready');
    } finally {
      cleanup();
    }
  });

  it('should expose error when resource function throws', async () => {
    async function fetchUser() {
      throw new Error('fetch failed');
    }

    function App(): JSXElement {
      const result = resource(() => fetchUser(), []);
      return {
        type: 'div',
        props: { children: [result.error ? result.error.message : 'no error'] },
      };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.textContent).toBe('fetch failed');
    } finally {
      cleanup();
    }
  });

  it('should allow refresh() to re-execute resource function', async () => {
    let callCount = 0;

    async function fetchUser() {
      callCount++;
      return { name: `A${callCount}` };
    }

    function App(): JSXElement {
      const result = resource(() => fetchUser(), []);
      return {
        type: 'div',
        props: {
          children: [result.value?.name || 'loading'],
          onClick: () => result.refresh(),
        },
      };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.textContent).toBe('A1');

      // Simulate click to refresh
      (container.firstChild as HTMLElement).click();
      // Allow microtasks/promises to settle, then flush pending scheduler work
      await new Promise((r) => setTimeout(r, 0));
      flushScheduler();

      // Refresh should re-execute the resource function and update value
      expect(container.textContent).toBe('A2');
    } finally {
      cleanup();
    }
  });

  it('should abort resource fetch on unmount', async () => {
    let aborted = false;

    async function fetchUser({ signal }: { signal: AbortSignal }) {
      return new Promise((_, reject) => {
        signal.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    }

    function App(): JSXElement {
      resource(({ signal }) => fetchUser({ signal }), []);
      return { type: 'div', props: { children: ['ok'] } };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      // Unmount should abort
      cleanup();

      expect(aborted).toBe(true);
    } finally {
      // cleanup already called
    }
  });
});
