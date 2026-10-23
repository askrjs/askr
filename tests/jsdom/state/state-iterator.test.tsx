import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('state destructuring', () => {
  it('should share one iterator function between state cells and destructure in order', () => {
    const cells: Array<ReturnType<typeof state<number>>> = [];
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({
        root: container,
        component: () => {
          const a = state(1);
          const b = state(2);
          cells.push(a, b);
          const [value, setValue] = a;
          expect(value).toBe(a);
          expect(setValue).toBe(a.set);
          return <p>{a() + b()}</p>;
        },
      });
      flushScheduler();
      expect(cells[0]![Symbol.iterator]).toBe(cells[1]![Symbol.iterator]);
      const [first, second] = cells[1]!;
      expect(first).toBe(cells[1]);
      expect(second).toBe(cells[1]!.set);
      expect([...cells[0]!]).toHaveLength(2);
    } finally {
      cleanup();
    }
  });
});
