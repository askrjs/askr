import { describe, expect, it } from 'vite-plus/test';
import { Case, For, Match, Show, state } from '../../../src';
import { createIsland } from '../../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// #485 desired contract. Each expected failure was reproduced against develop;
// remove `.fails` for a case when the corresponding boundary owns its state.
describe('lazy JSX control boundaries', () => {
  it.fails('can appear and disappear inside a ternary without changing parent hooks', () => {
    const { container, cleanup } = createTestContainer();
    let visible!: ReturnType<typeof state<boolean>>;
    const Page = () => {
      visible = state(false);
      return (
        <main>
          {visible() ? (
            <Show when={true}>
              <p>visible</p>
            </Show>
          ) : null}
        </main>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      expect(container.querySelector('p')).toBeNull();
      visible.set(true);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.querySelector('p')?.textContent).toBe('visible');
      visible.set(false);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.querySelector('p')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it.fails('can follow an early return in the parent component', () => {
    const { container, cleanup } = createTestContainer();
    let loading!: ReturnType<typeof state<boolean>>;
    const Page = () => {
      loading = state(true);
      if (loading()) return <p>loading</p>;
      return (
        <Show when={true}>
          <p>ready</p>
        </Show>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      expect(container.textContent).toBe('loading');
      loading.set(false);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.textContent).toBe('ready');
    } finally {
      cleanup();
    }
  });

  it.fails('reacts to a source without rerunning its parent', () => {
    const { container, cleanup } = createTestContainer();
    let visible!: ReturnType<typeof state<boolean>>;
    let parentRuns = 0;
    const Page = () => {
      parentRuns++;
      visible = state(false);
      return (
        <Show when={visible} fallback={<p>hidden</p>}>
          <p>visible</p>
        </Show>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      expect(container.textContent).toBe('hidden');
      visible.set(true);
      flushScheduler();
      expect(container.textContent).toBe('visible');
      visible.set(false);
      flushScheduler();
      expect(container.textContent).toBe('hidden');
      expect(parentRuns).toBe(1);
    } finally {
      cleanup();
    }
  });

  it.fails('uses its key to remount branch-local state', () => {
    const { container, cleanup } = createTestContainer();
    let identity!: ReturnType<typeof state<string>>;
    const Counter = () => {
      const count = state(0);
      return <button onClick={() => count.set(count() + 1)}>{count()}</button>;
    };
    const Page = () => {
      identity = state('first');
      return (
        <Show key={identity()} when={true}>
          <Counter />
        </Show>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      const first = container.querySelector('button');
      first?.click();
      flushScheduler();
      expect(first?.textContent).toBe('1');
      identity.set('second');
      flushScheduler();
      const second = container.querySelector('button');
      expect(second).not.toBe(first);
      expect(second?.textContent).toBe('0');
    } finally {
      cleanup();
    }
  });

  it.fails('does not read a hidden For source while creating Show children', () => {
    const { container, cleanup } = createTestContainer();
    let sourceReads = 0;
    const source = () => {
      sourceReads++;
      return ['a'];
    };
    const Page = () => (
      <Show when={false}>
        <For each={source} by={(item) => item}>
          {(item) => <p>{item}</p>}
        </For>
      </Show>
    );

    try {
      createIsland({ root: container, component: Page });
      expect(container.querySelector('p')).toBeNull();
      expect(sourceReads).toBe(0);
    } finally {
      cleanup();
    }
  });

  it.fails('allows a changing loop of Show elements', () => {
    const { container, cleanup } = createTestContainer();
    let items!: ReturnType<typeof state<string[]>>;
    const Page = () => {
      items = state(['a']);
      return (
        <main>
          {items().map((item) => (
            <Show key={item} when={true}>
              <p>{item}</p>
            </Show>
          ))}
        </main>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      expect(container.querySelectorAll('p')).toHaveLength(1);
      items.set(['a', 'b']);
      expect(() => flushScheduler()).not.toThrow();
      expect(
        Array.from(container.querySelectorAll('p'), (p) => p.textContent)
      ).toEqual(['a', 'b']);
    } finally {
      cleanup();
    }
  });

  it.fails('allows a For element inside a parent ternary', () => {
    const { container, cleanup } = createTestContainer();
    let visible!: ReturnType<typeof state<boolean>>;
    const Page = () => {
      visible = state(false);
      return (
        <main>
          {visible() ? (
            <For each={['a']} by={(item) => item}>
              {(item) => <p>{item}</p>}
            </For>
          ) : null}
        </main>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      visible.set(true);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.textContent).toBe('a');
    } finally {
      cleanup();
    }
  });

  it.fails('allows a Case after an early return', () => {
    const { container, cleanup } = createTestContainer();
    let loading!: ReturnType<typeof state<boolean>>;
    const Page = () => {
      loading = state(true);
      if (loading()) return <p>loading</p>;
      return (
        <Case fallback={<p>fallback</p>}>
          <Match when={true}>
            <p>ready</p>
          </Match>
        </Case>
      );
    };

    try {
      createIsland({ root: container, component: Page });
      loading.set(false);
      expect(() => flushScheduler()).not.toThrow();
      expect(container.textContent).toBe('ready');
    } finally {
      cleanup();
    }
  });
});
