import { describe, expect, it } from 'vite-plus/test';
import { derive, selector, state, type State } from '../../../src';
import { ErrorBoundary } from '@askrjs/askr/components';
import { For } from '../../../src/control';
import { selectorCandidateCount } from '../../../src/core/api/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * selector() keeps one entry per candidate it has been asked about, so a
 * paginated or streaming list must not grow it forever: an entry that no
 * reader observes any more is released.
 */
describe('selector candidate retention', () => {
  it.each([
    ['Object.is', undefined],
    ['a custom equals', (a: number, b: number) => a === b],
  ] as const)(
    'should release candidates no row reads any more with %s',
    (_name, equals) => {
      let page!: State<number>;
      let isSelected!: ReturnType<typeof selector<number>>;
      const { container, cleanup } = createTestContainer();
      try {
        createIsland({
          root: container,
          component: () => {
            const selected = state(3);
            page = state(0);
            isSelected = selector(selected, equals);
            const ids = () =>
              Array.from({ length: 10 }, (_, index) => page() * 10 + index);
            return (
              <ul>
                <For each={ids} by={(id) => id}>
                  {(id) => <li data-selected={() => String(isSelected(id))} />}
                </For>
              </ul>
            );
          },
        });
        flushScheduler();
        expect(selectorCandidateCount(isSelected)).toBe(10);

        for (let next = 1; next <= 20; next++) {
          page.set(next);
          flushScheduler();
        }

        expect(container.querySelectorAll('li')).toHaveLength(10);
        expect(selectorCandidateCount(isSelected)).toBe(10);
      } finally {
        cleanup();
      }
    }
  );

  it('should not retain candidates read outside a reactive computation', () => {
    let isSelected!: ReturnType<typeof selector<number>>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          isSelected = selector(state(1));
          return <p />;
        },
      });
      flushScheduler();
      for (let id = 0; id < 50; id++) isSelected(id);
      expect(isSelected(1)).toBe(true);
      expect(selectorCandidateCount(isSelected)).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('should keep notifying a reader that takes over a candidate in the same run', () => {
    let selected!: State<number>;
    let useDerived!: State<boolean>;
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          selected = state(0);
          useDerived = state(true);
          const isSelected = selector(selected);
          const derived = derive(() => (useDerived() ? isSelected(5) : false));
          // Reads candidate 5 itself only once the derive has stopped reading
          // it, in the same render that makes the derive drop it.
          const own = useDerived() ? false : isSelected(5);
          derived();
          return <p data-selected={String(own)} />;
        },
      });
      flushScheduler();
      useDerived.set(false);
      flushScheduler();
      selected.set(5);
      flushScheduler();
      expect(container.querySelector('p')?.getAttribute('data-selected')).toBe(
        'true'
      );
    } finally {
      cleanup();
    }
  });

  it('should keep notifying a row whose discarded render is restored', () => {
    let selected!: State<number>;
    let id!: State<number>;
    let armed = true;
    function Boom() {
      if (armed) throw new Error('row failed');
      return null;
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          selected = state(1);
          id = state(1);
          const isSelected = selector(selected);
          return (
            <p data-selected={String(isSelected(id()))}>
              {id() === 2 ? <Boom /> : null}
            </p>
          );
        },
      });
      flushScheduler();
      expect(container.querySelector('p')?.getAttribute('data-selected')).toBe(
        'true'
      );
      id.set(2);
      expect(() => flushScheduler()).toThrow('row failed');
      armed = false;
      // Only the selection changes: the row must still be notified through the
      // candidate its restored render read.
      selected.set(7);
      flushScheduler();
      expect(container.querySelector('p')?.getAttribute('data-selected')).toBe(
        'false'
      );
    } finally {
      cleanup();
    }
  });

  it('should not retain candidates read by renders that fail', () => {
    let attempt!: State<number>;
    let isSelected!: ReturnType<typeof selector<number>>;
    function Row(props: { id: number }) {
      isSelected(props.id);
      if (props.id > 0) throw new Error('row failed');
      return <p />;
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          attempt = state(0);
          isSelected = selector(state(0));
          return (
            <ErrorBoundary fallback={() => <p>failed</p>} resetKey={attempt()}>
              <Row id={attempt()} />
            </ErrorBoundary>
          );
        },
      });
      flushScheduler();
      for (let next = 1; next <= 20; next++) {
        attempt.set(next);
        flushScheduler();
      }
      expect(selectorCandidateCount(isSelected)).toBeLessThanOrEqual(1);
    } finally {
      cleanup();
    }
  });
});
