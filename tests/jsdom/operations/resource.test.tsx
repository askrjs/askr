import { describe, it, expect, vi } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import { state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

describe('resource() (unified async primitive) — gaps', () => {
  it('should refetch from a tracked source and abort the previous request', async () => {
    let setId!: (value: string) => void;
    const requests: Array<{ id: string; signal: AbortSignal }> = [];
    function App(): JSXElement {
      const id = state('first');
      setId = id.set;
      const result = resource(id, (current, { signal }) => {
        requests.push({ id: current, signal });
        return new Promise<string>(() => {});
      });
      return <div>{result.value ?? 'pending'}</div>;
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      expect(requests.map(({ id }) => id)).toEqual(['first']);
      expect(container.textContent).toBe('pending');

      setId('second');
      flushScheduler();
      await waitForNextEvaluation();
      expect(requests.map(({ id }) => id)).toEqual(['first', 'second']);
      expect(requests[0].signal.aborted).toBe(true);
    } finally {
      cleanup();
    }
    expect(requests[1].signal.aborted).toBe(true);
  });

  it('should not start a source-driven request for a rolled-back render', async () => {
    let setId!: (value: string) => void;
    let setFailure!: (value: boolean) => void;
    const requests: string[] = [];
    const Failure = ({ active }: { active: boolean }): JSXElement => {
      if (active) throw new Error('render failed');
      return null;
    };
    function App(): JSXElement {
      const id = state('first');
      const fail = state(false);
      setId = id.set;
      setFailure = fail.set;
      const result = resource(id, (current) => {
        requests.push(current);
        return current;
      });
      return (
        <main>
          <span>{result.value ?? 'pending'}</span>
          <Failure active={fail()} />
        </main>
      );
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      expect(requests).toEqual(['first']);

      setId('second');
      setFailure(true);
      expect(() => flushScheduler()).toThrow();
      await waitForNextEvaluation();
      expect(requests).toEqual(['first']);

      setFailure(false);
      setId('third');
      flushScheduler();
      await waitForNextEvaluation();
      expect(requests).toEqual(['first', 'third']);
      expect(container.textContent).toBe('third');
    } finally {
      cleanup();
    }
  });

  it('should execute resource when component mounts', async () => {
    const calls: Array<string> = [];

    async function fetchUser(id: string) {
      calls.push(`fetch:${id}`);
      return { name: 'A' };
    }

    function App(): JSXElement {
      // Spec: this must NOT execute fetchUser during render.
      resource(() => fetchUser('123'), ['123']);
      return <div>{'ok'}</div>;
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
      return <div>{result.pending ? 'pending' : 'ready'}</div>;
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
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    async function fetchUser() {
      throw new Error('fetch failed');
    }

    function App(): JSXElement {
      const result = resource(() => fetchUser(), []);
      return <div>{result.error ? result.error.message : 'no error'}</div>;
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.textContent).toBe('fetch failed');
      expect(error).toHaveBeenCalled();
    } finally {
      error.mockRestore();
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
      return (
        <div onClick={() => result.refresh()}>
          {result.value?.name || 'loading'}
        </div>
      );
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
      await Promise.resolve();
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
      return <div>{'ok'}</div>;
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
