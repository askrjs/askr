import { describe, it, expect, vi, afterEach } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import type { JSXElement } from '../../../src/jsx/types';
import { state, type State } from '../../../src';
import { ErrorBoundary } from '@askrjs/askr/components';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

async function settleResourceWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  flushScheduler();
  await Promise.resolve();
  flushScheduler();
}

function flushIgnoringRenderFailure(): void {
  try {
    flushScheduler();
  } catch {
    // The rolled-back render may surface its error through the scheduler.
  }
}

// #471: a deps change observed by a render that is later rolled back must not
// leave the resource permanently pending. The next committed render with the
// same deps has to start the fetch the rolled-back render never committed.
describe('resource() deps change in a rolled-back render (#471)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Bomb(props: { fail: boolean }): JSXElement {
    if (props.fail) throw new Error('sibling render failed');
    return <span>ok</span>;
  }

  it('should fetch the new deps once a sibling failure in the same render recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn(async ({ id }: { id: string }) => `value:${id}`);
    let id!: State<string>;
    let fail!: State<boolean>;

    const App = (): JSXElement => {
      id = state('a');
      fail = state(false);
      const current = id();
      const result = resource(() => load({ id: current }), [current]);
      return (
        <div>
          <p id="value">{result.pending ? 'loading' : String(result.value)}</p>
          <Bomb fail={fail()} />
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.querySelector('#value')?.textContent).toBe('value:a');

      id.set('b');
      fail.set(true);
      flushIgnoringRenderFailure();
      await settleResourceWork();
      expect(load).not.toHaveBeenCalledWith({ id: 'b' });

      fail.set(false);
      flushScheduler();
      await settleResourceWork();

      expect(load).toHaveBeenCalledWith({ id: 'b' });
      expect(container.querySelector('#value')?.textContent).toBe('value:b');
    } finally {
      cleanup();
    }
  });

  it('should fetch the new deps once a sibling component failure recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn(async ({ id }: { id: string }) => `value:${id}`);
    let id!: State<string>;
    let fail!: State<boolean>;

    function Loader(props: { id: string }): JSXElement {
      const current = props.id;
      const result = resource(() => load({ id: current }), [current]);
      return (
        <p id="value">{result.pending ? 'loading' : String(result.value)}</p>
      );
    }

    const App = (): JSXElement => {
      id = state('a');
      fail = state(false);
      return (
        <div>
          <Loader id={id()} />
          <Bomb fail={fail()} />
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.querySelector('#value')?.textContent).toBe('value:a');

      id.set('b');
      fail.set(true);
      flushIgnoringRenderFailure();
      await settleResourceWork();
      expect(load).not.toHaveBeenCalledWith({ id: 'b' });

      fail.set(false);
      flushScheduler();
      await settleResourceWork();

      expect(load).toHaveBeenCalledWith({ id: 'b' });
      expect(container.querySelector('#value')?.textContent).toBe('value:b');
    } finally {
      cleanup();
    }
  });

  it('should keep the committed value when a rolled-back deps change is reverted', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn(async ({ id }: { id: string }) => `value:${id}`);
    let id!: State<string>;
    let fail!: State<boolean>;
    let tick!: State<number>;

    function Loader(props: { id: string; tick: number }): JSXElement {
      const current = props.id;
      const result = resource(() => load({ id: current }), [current]);
      return (
        <p id="value" data-tick={String(props.tick)}>
          {result.pending ? 'loading' : String(result.value)}
        </p>
      );
    }

    const App = (): JSXElement => {
      id = state('a');
      fail = state(false);
      tick = state(0);
      return (
        <div>
          <Loader id={id()} tick={tick()} />
          <Bomb fail={fail()} />
        </div>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.querySelector('#value')?.textContent).toBe('value:a');

      id.set('b');
      fail.set(true);
      flushIgnoringRenderFailure();
      await settleResourceWork();

      id.set('a');
      fail.set(false);
      tick.set(1);
      flushScheduler();
      await settleResourceWork();

      expect(container.querySelector('#value')?.textContent).toBe('value:a');
      expect(load).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
  });

  it('should fetch the new deps after an ErrorBoundary reset re-renders the same deps', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const load = vi.fn(async ({ id }: { id: string }) => `value:${id}`);
    let id!: State<string>;
    let fail!: State<boolean>;
    let reset!: State<number>;

    function Loader(props: { id: string }): JSXElement {
      const current = props.id;
      const result = resource(() => load({ id: current }), [current]);
      return (
        <p id="value">{result.pending ? 'loading' : String(result.value)}</p>
      );
    }

    const App = (): JSXElement => {
      id = state('a');
      fail = state(false);
      reset = state(0);
      return (
        <ErrorBoundary
          resetKey={reset()}
          fallback={<p id="fallback">fallback</p>}
        >
          <Loader id={id()} />
          <Bomb fail={fail()} />
        </ErrorBoundary>
      );
    };

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await settleResourceWork();
      expect(container.querySelector('#value')?.textContent).toBe('value:a');

      id.set('b');
      fail.set(true);
      flushIgnoringRenderFailure();
      await settleResourceWork();

      fail.set(false);
      reset.set(1);
      flushScheduler();
      await settleResourceWork();

      expect(load).toHaveBeenCalledWith({ id: 'b' });
      expect(container.querySelector('#value')?.textContent).toBe('value:b');
    } finally {
      cleanup();
    }
  });
});
