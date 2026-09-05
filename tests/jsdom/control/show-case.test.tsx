import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import { resource } from '../../../src/resources';
import { getCurrentComponentInstance } from '../../../src/runtime';
import { createFineGrainedEffect } from '../../../src/runtime/effect';
import { Case, Match, Show } from '@askrjs/askr/control';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

type ReaderTracked = {
  _readers?: Map<unknown, unknown>;
};

describe('Show primitive', () => {
  it('should dispose a removed comment-host component subscription', () => {
    const { container, cleanup } = createTestContainer();
    let visible!: ReturnType<typeof state<boolean>>;
    let shared!: ReturnType<typeof state<number>>;
    let childRenders = 0;

    const EmptyReader = () => {
      childRenders += 1;
      shared();
      return null;
    };

    const App = () => {
      visible = state(true);
      shared = state(0);
      return (
        <Show when={visible}>
          <EmptyReader />
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const readers = (shared as ReaderTracked)._readers!;
    const [departedInstance] = readers.keys() as IterableIterator<{
      mounted: boolean;
    }>;
    expect(readers.size).toBe(1);
    expect(departedInstance?.mounted).toBe(true);

    visible.set(false);
    flushScheduler();

    expect(readers.has(departedInstance)).toBe(false);
    expect(departedInstance?.mounted).toBe(false);

    shared.set(1);
    flushScheduler();
    expect(childRenders).toBe(1);

    cleanup();
  });

  it('should render static children when the condition is truthy', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Show when={true} fallback={<p id="show-static-fallback">fallback</p>}>
        <p id="show-static-child">ready</p>
      </Show>
    );

    createIsland({ root: container, component: App });

    expect(container.querySelector('#show-static-child')?.textContent).toBe(
      'ready'
    );
    expect(container.querySelector('#show-static-fallback')).toBeNull();

    cleanup();
  });

  it('should render fallback when the condition is falsy', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Show when={false} fallback={<p id="show-static-fallback">fallback</p>}>
        <p id="show-static-child">ready</p>
      </Show>
    );

    createIsland({ root: container, component: App });

    expect(container.querySelector('#show-static-fallback')?.textContent).toBe(
      'fallback'
    );
    expect(container.querySelector('#show-static-child')).toBeNull();

    cleanup();
  });

  it('should render array fallback content when the condition is falsy', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Show
        when={false}
        fallback={[
          <p id="show-array-fallback-first" key="first">
            fallback
          </p>,
          <p id="show-array-fallback-second" key="second">
            content
          </p>,
        ]}
      >
        <p id="show-array-child">ready</p>
      </Show>
    );

    createIsland({ root: container, component: App });

    expect(
      container.querySelector('#show-array-fallback-first')?.textContent
    ).toBe('fallback');
    expect(
      container.querySelector('#show-array-fallback-second')?.textContent
    ).toBe('content');
    expect(container.querySelector('#show-array-child')).toBeNull();

    cleanup();
  });

  it('should switch from fallback to truthy content when a resource-backed condition resolves', async () => {
    const { container, cleanup } = createTestContainer();
    let resolveUser: ((value: { name: string }) => void) | null = null;

    const App = () => {
      const user = resource<{ name: string }>(
        () =>
          new Promise<{ name: string }>((resolve) => {
            resolveUser = resolve;
          }),
        []
      );

      return (
        <Show
          when={() => user.value}
          fallback={<p id="show-resource-fallback">loading</p>}
        >
          {(value: { name: string }) => (
            <p id="show-resource-value">{value.name}</p>
          )}
        </Show>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      expect(
        container.querySelector('#show-resource-fallback')?.textContent
      ).toBe('loading');

      resolveUser?.({ name: 'Ada' });
      await waitForNextEvaluation();
      flushScheduler();

      expect(container.querySelector('#show-resource-fallback')).toBeNull();
      expect(container.querySelector('#show-resource-value')?.textContent).toBe(
        'Ada'
      );
    } finally {
      cleanup();
    }
  });

  it('should not rerender the parent when active-branch local state changes', () => {
    const { container, cleanup } = createTestContainer();
    let appRenders = 0;

    const Counter = ({ user }: { user: { name: string } }) => {
      const clicks = state(0);
      return (
        <button
          id="show-local-counter"
          onClick={() => clicks.set((value) => value + 1)}
        >
          {`${user.name}:${clicks()}`}
        </button>
      );
    };

    const App = () => {
      appRenders += 1;
      const user = state<{ name: string } | null>({ name: 'Ada' });

      return (
        <Show when={user} fallback={<p id="show-local-fallback">login</p>}>
          {(value: { name: string }) => <Counter user={value} />}
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector(
      '#show-local-counter'
    ) as HTMLButtonElement;
    expect(appRenders).toBe(1);

    button.click();
    flushScheduler();

    expect(button.textContent).toBe('Ada:1');
    expect(appRenders).toBe(1);

    cleanup();
  });

  it('should render a function child and preserve state while the truthy branch stays active', () => {
    const { container, cleanup } = createTestContainer();
    let setUser: (next: { name: string } | null) => void = () => {};

    const Counter = ({ user }: { user: { name: string } }) => {
      const clicks = state(0);
      return (
        <button
          id="show-counter"
          onClick={() => clicks.set((value) => value + 1)}
        >
          {`${user.name}:${clicks()}`}
        </button>
      );
    };

    const App = () => {
      const user = state<{ name: string } | null>({ name: 'Ada' });
      setUser = (next) => user.set(next);

      return (
        <Show when={user} fallback={<p id="show-fallback">login</p>}>
          {(value: { name: string }) => <Counter user={value} />}
        </Show>
      );
    };

    createIsland({ root: container, component: App });

    const button = container.querySelector(
      '#show-counter'
    ) as HTMLButtonElement;
    expect(button.textContent).toBe('Ada:0');

    button.click();
    flushScheduler();
    expect(button.textContent).toBe('Ada:1');

    setUser({ name: 'Grace' });
    flushScheduler();

    const nextButton = container.querySelector(
      '#show-counter'
    ) as HTMLButtonElement;
    expect(nextButton.textContent).toBe('Grace:1');

    cleanup();
  });

  it('should only invoke a function child with truthy values', () => {
    const { container, cleanup } = createTestContainer();
    const seen: string[] = [];
    let setStatus: (next: '' | 'ready' | null) => void = () => {};

    const App = () => {
      const status = state<'' | 'ready' | null>('');
      setStatus = (next) => status.set(next);

      return (
        <Show when={status} fallback={<p id="show-truthy-fallback">idle</p>}>
          {(value) => {
            seen.push(value);
            return <p id="show-truthy-value">{value}</p>;
          }}
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#show-truthy-fallback')?.textContent).toBe(
      'idle'
    );
    expect(seen).toEqual([]);

    setStatus('ready');
    flushScheduler();

    expect(container.querySelector('#show-truthy-value')?.textContent).toBe(
      'ready'
    );
    expect(seen).toEqual(['ready']);

    setStatus('');
    flushScheduler();

    expect(container.querySelector('#show-truthy-fallback')?.textContent).toBe(
      'idle'
    );
    expect(seen).toEqual(['ready']);

    cleanup();
  });

  it('should switch to fallback and release truthy-branch subscriptions', () => {
    allowFrameworkWarnings(/\[askr\] Unused state variable detected/);
    const { container, cleanup } = createTestContainer();
    let setVisible: (next: boolean) => void = () => {};
    let shared!: ReturnType<typeof state<string>>;
    let branchRenders = 0;

    const Truthy = () => {
      branchRenders += 1;
      return <div id="show-truthy">{shared()}</div>;
    };

    const App = () => {
      const visible = state(true);
      shared = state('ready');
      setVisible = (next) => visible.set(next);

      return (
        <Show when={visible} fallback={<div id="show-fallback">fallback</div>}>
          <Truthy />
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.querySelector('#show-truthy')?.textContent).toBe('ready');
    expect((shared as unknown as ReaderTracked)._readers?.size ?? 0).toBe(1);

    setVisible(false);
    flushScheduler();

    expect(container.querySelector('#show-truthy')).toBeNull();
    expect(container.querySelector('#show-fallback')?.textContent).toBe(
      'fallback'
    );
    expect((shared as unknown as ReaderTracked)._readers?.size ?? 0).toBe(0);

    const renderCount = branchRenders;
    shared.set('changed');
    flushScheduler();
    expect(branchRenders).toBe(renderCount);

    cleanup();
  });

  it('should dispose nested resource and effect descendants when branch is removed', () => {
    const { container, cleanup } = createTestContainer();
    let setVisible: (next: boolean) => void = () => {};
    let setNestedCount: (next: number) => void = () => {};
    let resourceAborts = 0;
    let effectCleanups = 0;
    const effectCommits: number[] = [];

    const Nested = () => {
      const instance = getCurrentComponentInstance();
      if (!instance) {
        throw new Error('expected nested component instance');
      }

      const count = state(0);
      setNestedCount = count.set;
      const data = resource<string>(
        ({ signal }) =>
          new Promise<string>(() => {
            signal.addEventListener('abort', () => {
              resourceAborts += 1;
            });
          }),
        []
      );
      const effect = createFineGrainedEffect({
        lane: 'reactive',
        compute: () => count(),
        commit: (value) => {
          effectCommits.push(value);
        },
      });

      (instance.ownership.cleanups ??= []).push(() => {
        effectCleanups += 1;
        effect.cleanup();
      });

      return (
        <span id={'show-nested'}>
          {data.pending ? 'loading' : data.value}:{count()}
        </span>
      );
    };

    const Branch = () => (
      <div id={'show-branch'}>
        <Nested />
      </div>
    );

    const App = () => {
      const visible = state(true);
      setVisible = (next) => visible.set(next);

      return (
        <Show when={visible} fallback={<div id="show-fallback">fallback</div>}>
          <Branch />
        </Show>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#show-nested')?.textContent).toBe(
      'loading:0'
    );
    expect(effectCommits).toEqual([0]);

    setVisible(false);
    flushScheduler();

    expect(container.querySelector('#show-branch')).toBeNull();
    expect(container.querySelector('#show-fallback')?.textContent).toBe(
      'fallback'
    );
    expect(resourceAborts).toBe(1);
    expect(effectCleanups).toBe(1);

    setNestedCount(1);
    flushScheduler();

    expect(effectCommits).toEqual([0]);
    expect(container.querySelector('#show-nested')).toBeNull();

    cleanup();
  });
});

describe('Case primitive', () => {
  it('should not rerender the parent when the active branch updates local state', () => {
    const { container, cleanup } = createTestContainer();
    let appRenders = 0;

    const Loading = () => {
      const clicks = state(0);
      return (
        <button
          id="case-local-loading"
          onClick={() => clicks.set((value) => value + 1)}
        >
          {`loading:${clicks()}`}
        </button>
      );
    };

    const App = () => {
      appRenders += 1;
      const mode = state<'loading' | 'ready'>('loading');

      return (
        <Case fallback={<div id="case-local-fallback">fallback</div>}>
          <Match when={mode() === 'loading'}>
            <Loading />
          </Match>
          <Match when={mode() === 'ready'}>
            <div id="case-local-ready">ready</div>
          </Match>
        </Case>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector(
      '#case-local-loading'
    ) as HTMLButtonElement;
    expect(appRenders).toBe(1);

    button.click();
    flushScheduler();

    expect(button.textContent).toBe('loading:1');
    expect(appRenders).toBe(1);

    cleanup();
  });

  it('should render the first truthy Match and ignore later matches', () => {
    const { container, cleanup } = createTestContainer();
    let setStatus: (next: 'loading' | 'ready') => void = () => {};

    const App = () => {
      const status = state<'loading' | 'ready'>('loading');
      setStatus = (next) => status.set(next);

      return (
        <Case fallback={<div id="case-fallback">fallback</div>}>
          <Match when={status() === 'loading'}>
            <div id="loading">loading</div>
          </Match>
          <Match when={true}>
            <div id="later">later</div>
          </Match>
        </Case>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.querySelector('#loading')?.textContent).toBe('loading');
    expect(container.querySelector('#later')).toBeNull();

    setStatus('ready');
    flushScheduler();

    expect(container.querySelector('#loading')).toBeNull();
    expect(container.querySelector('#later')?.textContent).toBe('later');

    cleanup();
  });

  it('should preserve state while the same branch remains selected', () => {
    const { container, cleanup } = createTestContainer();
    let setMode: (next: 'loading' | 'ready') => void = () => {};
    let setLabel: (next: string) => void = () => {};

    const Loading = ({ label }: { label: string }) => {
      const clicks = state(0);
      return (
        <button
          id="case-loading"
          onClick={() => clicks.set((value) => value + 1)}
        >
          {`${label}:${clicks()}`}
        </button>
      );
    };

    const Ready = () => <div id="case-ready">ready</div>;

    const App = () => {
      const mode = state<'loading' | 'ready'>('loading');
      const label = state('load');
      setMode = (next) => mode.set(next);
      setLabel = (next) => label.set(next);

      return (
        <Case fallback={<div id="case-fallback">fallback</div>}>
          <Match when={mode() === 'loading'}>
            <Loading label={label()} />
          </Match>
          <Match when={mode() === 'ready'}>
            <Ready />
          </Match>
        </Case>
      );
    };

    createIsland({ root: container, component: App });

    const button = container.querySelector(
      '#case-loading'
    ) as HTMLButtonElement;
    button.click();
    flushScheduler();
    expect(button.textContent).toBe('load:1');

    setLabel('still-loading');
    flushScheduler();

    const nextButton = container.querySelector(
      '#case-loading'
    ) as HTMLButtonElement;
    expect(nextButton.textContent).toBe('still-loading:1');

    setMode('ready');
    flushScheduler();

    expect(container.querySelector('#case-loading')).toBeNull();
    expect(container.querySelector('#case-ready')?.textContent).toBe('ready');

    cleanup();
  });

  it('should remount when switching from a Match whose key collides with the internal fallback key to fallback', () => {
    const { container, cleanup } = createTestContainer();
    let setMode: (next: 'matched' | 'fallback') => void = () => {};

    const Panel = ({ id, label }: { id: string; label: string }) => {
      const clicks = state(0);
      return (
        <button id={id} onClick={() => clicks.set((value) => value + 1)}>
          {`${label}:${clicks()}`}
        </button>
      );
    };

    const App = () => {
      const mode = state<'matched' | 'fallback'>('matched');
      setMode = (next) => mode.set(next);

      return (
        <Case fallback={<Panel id="case-fallback" label="fallback" />}>
          <Match key="__case-fallback__" when={mode() === 'matched'}>
            <Panel id="case-matched" label="matched" />
          </Match>
        </Case>
      );
    };

    try {
      createIsland({ root: container, component: App });

      const matched = container.querySelector(
        '#case-matched'
      ) as HTMLButtonElement;
      matched.click();
      flushScheduler();
      expect(matched.textContent).toBe('matched:1');

      setMode('fallback');
      flushScheduler();

      expect(container.querySelector('#case-matched')).toBeNull();
      expect(container.querySelector('#case-fallback')?.textContent).toBe(
        'fallback:0'
      );
    } finally {
      cleanup();
    }
  });

  it('should remount when switching between two Match branches with the same user key', () => {
    const { container, cleanup } = createTestContainer();
    let setMode: (next: 'first' | 'second') => void = () => {};

    const Panel = ({ id, label }: { id: string; label: string }) => {
      const clicks = state(0);
      return (
        <button id={id} onClick={() => clicks.set((value) => value + 1)}>
          {`${label}:${clicks()}`}
        </button>
      );
    };

    const App = () => {
      const mode = state<'first' | 'second'>('first');
      setMode = (next) => mode.set(next);

      return (
        <Case>
          <Match key="same" when={mode() === 'first'}>
            <Panel id="case-first" label="first" />
          </Match>
          <Match key="same" when={mode() === 'second'}>
            <Panel id="case-second" label="second" />
          </Match>
        </Case>
      );
    };

    try {
      createIsland({ root: container, component: App });

      const first = container.querySelector('#case-first') as HTMLButtonElement;
      first.click();
      flushScheduler();
      expect(first.textContent).toBe('first:1');

      setMode('second');
      flushScheduler();

      expect(container.querySelector('#case-first')).toBeNull();
      expect(container.querySelector('#case-second')?.textContent).toBe(
        'second:0'
      );
    } finally {
      cleanup();
    }
  });

  it('should release previous branch subscriptions when selection changes', () => {
    allowFrameworkWarnings(/\[askr\] Unused state variable detected/);
    const { container, cleanup } = createTestContainer();
    let setMode: (next: 'loading' | 'ready') => void = () => {};
    let shared!: ReturnType<typeof state<string>>;
    let loadingRenders = 0;

    const LoadingView = () => (
      <div id="case-loading">{`${shared()}:${++loadingRenders}`}</div>
    );

    const App = () => {
      const mode = state<'loading' | 'ready'>('loading');
      shared = state('shared');
      setMode = (next) => mode.set(next);

      return (
        <Case fallback={<div id="case-fallback">fallback</div>}>
          <Match when={mode() === 'loading'}>
            <LoadingView />
          </Match>
          <Match when={mode() === 'ready'}>
            <div id="case-ready">ready</div>
          </Match>
        </Case>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.querySelector('#case-loading')?.textContent).toBe(
      'shared:1'
    );
    expect((shared as unknown as ReaderTracked)._readers?.size ?? 0).toBe(1);

    setMode('ready');
    flushScheduler();

    expect(container.querySelector('#case-loading')).toBeNull();
    expect(container.querySelector('#case-ready')?.textContent).toBe('ready');
    expect((shared as unknown as ReaderTracked)._readers?.size ?? 0).toBe(0);

    const renderCount = loadingRenders;
    shared.set('changed');
    flushScheduler();
    expect(loadingRenders).toBe(renderCount);

    cleanup();
  });

  it('should render fallback when no Match is truthy', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Case fallback={<div id="case-fallback">fallback</div>}>
        <Match when={false}>
          <div id="never">never</div>
        </Match>
      </Case>
    );

    createIsland({ root: container, component: App });
    expect(container.querySelector('#case-fallback')?.textContent).toBe(
      'fallback'
    );
    expect(container.querySelector('#never')).toBeNull();

    cleanup();
  });

  it('should render a zero-argument Match thunk child', () => {
    const { container, cleanup } = createTestContainer();
    let setMode: (next: 'loading' | 'ready') => void = () => {};

    const App = () => {
      const mode = state<'loading' | 'ready'>('loading');
      setMode = (next) => mode.set(next);

      return (
        <Case fallback={<div id="case-fallback">fallback</div>}>
          <Match when={mode() === 'loading'}>
            {() => [
              <div id="case-loading" key="loading">
                loading
              </div>,
              <div id="case-loading-detail" key="detail">
                detail
              </div>,
            ]}
          </Match>
          <Match when={mode() === 'ready'}>
            <div id="case-ready">ready</div>
          </Match>
        </Case>
      );
    };

    createIsland({ root: container, component: App });
    expect(container.querySelector('#case-loading')?.textContent).toBe(
      'loading'
    );
    expect(container.querySelector('#case-loading-detail')?.textContent).toBe(
      'detail'
    );

    setMode('ready');
    flushScheduler();

    expect(container.querySelector('#case-loading')).toBeNull();
    expect(container.querySelector('#case-loading-detail')).toBeNull();
    expect(container.querySelector('#case-ready')?.textContent).toBe('ready');

    cleanup();
  });

  it('should throw when Case receives non-Match children', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Case>
        <div>invalid</div>
      </Case>
    );

    expect(() => createIsland({ root: container, component: App })).toThrow(
      /only accepts <Match> children/
    );

    cleanup();
  });

  it('should throw when Match is rendered outside Case', () => {
    const { container, cleanup } = createTestContainer();

    const App = () => (
      <Match when={true}>
        <div>invalid</div>
      </Match>
    );

    expect(() => createIsland({ root: container, component: App })).toThrow(
      /may only be used as a direct child of <Case>/
    );

    cleanup();
  });
});
