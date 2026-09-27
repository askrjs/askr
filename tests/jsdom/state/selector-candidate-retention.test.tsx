import { describe, expect, it } from 'vite-plus/test';
import { selector, state, type State } from '../../../src';
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
});
