import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import { Case, For, Match, Show } from '@askrjs/askr/control';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('anchored multi-node control ranges', () => {
  it('should render and replace multi-node Show and Case branches', () => {
    const { container, cleanup } = createTestContainer();
    let setVisible: (value: boolean) => void = () => {};
    let setChoice: (value: string) => void = () => {};

    const App = () => {
      const visible = state(true);
      const choice = state('one');
      setVisible = (value) => visible.set(value);
      setChoice = (value) => choice.set(value);

      return (
        <main>
          <Show
            when={visible()}
            fallback={
              <>
                <i id="show-fallback-a">F</i>
                <i id="show-fallback-b">F</i>
              </>
            }
          >
            <span id="show-a">A</span>
            <span id="show-b">B</span>
          </Show>
          <Case
            fallback={
              <>
                <b id="case-fallback-a">F</b>
                <b id="case-fallback-b">F</b>
              </>
            }
          >
            <Match when={choice() === 'one'}>
              <em id="case-one-a">1</em>
              <em id="case-one-b">1</em>
            </Match>
            <Match when={choice() === 'two'}>
              <em id="case-two-a">2</em>
              <em id="case-two-b">2</em>
            </Match>
          </Case>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      expect(container.querySelector('#show-a')).not.toBeNull();
      expect(container.querySelector('#show-b')).not.toBeNull();
      expect(container.querySelector('#case-one-a')).not.toBeNull();
      expect(container.querySelector('#case-one-b')).not.toBeNull();
      expect(container.innerHTML).toContain('askr-range-start');
      expect(container.innerHTML).toContain('askr-range-end');

      setVisible(false);
      setChoice('two');
      flushScheduler();

      expect(container.querySelector('#show-a')).toBeNull();
      expect(container.querySelector('#show-b')).toBeNull();
      expect(container.querySelector('#show-fallback-a')).not.toBeNull();
      expect(container.querySelector('#show-fallback-b')).not.toBeNull();
      expect(container.querySelector('#case-one-a')).toBeNull();
      expect(container.querySelector('#case-one-b')).toBeNull();
      expect(container.querySelector('#case-two-a')).not.toBeNull();
      expect(container.querySelector('#case-two-b')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should move keyed multi-node For items as complete ranges', () => {
    const { container, cleanup } = createTestContainer();
    let setRows: (value: number[]) => void = () => {};

    const App = () => {
      const rows = state([1, 2, 3]);
      setRows = (value) => rows.set(value);
      return (
        <section>
          <For each={() => rows()} by={(row) => row}>
            {(row) => (
              <>
                <span data-row={row}>{`a${row}`}</span>
                <span data-row={row}>{`b${row}`}</span>
              </>
            )}
          </For>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });
      const before = container.querySelector('[data-row="2"]');
      setRows([3, 1, 2]);
      flushScheduler();

      const rows = Array.from(container.querySelectorAll('[data-row]')).map(
        (node) => node.textContent
      );
      expect(rows).toEqual(['a3', 'b3', 'a1', 'b1', 'a2', 'b2']);
      expect(container.querySelector('[data-row="2"]')).toBe(before);
      expect(container.innerHTML).toContain('askr-range-start');
      expect(container.innerHTML).toContain('askr-range-end');

      setRows([3, 1]);
      flushScheduler();
      expect(container.querySelectorAll('[data-row="2"]')).toHaveLength(0);
      expect(
        Array.from(container.querySelectorAll('[data-row]')).map(
          (node) => node.textContent
        )
      ).toEqual(['a3', 'b3', 'a1', 'b1']);
    } finally {
      cleanup();
    }
  });

  it('should insert a newly shown sibling after the preceding boundary is removed', () => {
    const { container, cleanup } = createTestContainer();
    let setFirstVisible: (value: boolean) => void = () => {};
    let setSecondVisible: (value: boolean) => void = () => {};

    const App = () => {
      const firstVisible = state(true);
      const secondVisible = state(false);
      setFirstVisible = (value) => firstVisible.set(value);
      setSecondVisible = (value) => secondVisible.set(value);

      return (
        <main>
          <Show when={firstVisible()}>
            <span id="first-boundary">first</span>
          </Show>
          <Show when={secondVisible()}>
            <span id="second-boundary">second</span>
          </Show>
          <span id="tail">tail</span>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });

      setFirstVisible(false);
      setSecondVisible(true);
      flushScheduler();

      expect(container.querySelector('#first-boundary')).toBeNull();
      expect(container.querySelector('#second-boundary')?.textContent).toBe(
        'second'
      );
      expect(container.querySelector('main')?.textContent).toBe('secondtail');
    } finally {
      cleanup();
    }
  });

  it('should preserve sibling order when replacing adjacent multi-node boundaries', () => {
    const { container, cleanup } = createTestContainer();
    let setFirstVisible: (value: boolean) => void = () => {};
    let setSecondVisible: (value: boolean) => void = () => {};

    const App = () => {
      const firstVisible = state(true);
      const secondVisible = state(false);
      setFirstVisible = (value) => firstVisible.set(value);
      setSecondVisible = (value) => secondVisible.set(value);

      return (
        <main>
          <Show when={firstVisible()}>
            <span>first-a</span>
            <span>first-b</span>
          </Show>
          <Show when={secondVisible()}>
            <span>second-a</span>
            <span>second-b</span>
          </Show>
          <span>tail</span>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });

      setFirstVisible(false);
      setSecondVisible(true);
      flushScheduler();

      expect(container.querySelector('main')?.textContent).toBe(
        'second-asecond-btail'
      );
    } finally {
      cleanup();
    }
  });
});
