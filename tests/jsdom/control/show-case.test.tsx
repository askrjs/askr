import { describe, it, expect } from 'vite-plus/test';
import { Case, Match, Show, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

type ReaderTracked = {
  _readers?: Map<unknown, unknown>;
};

describe('Show primitive', () => {
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
});

describe('Case primitive', () => {
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
