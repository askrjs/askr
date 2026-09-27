import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { controllableState } from '../../../src/foundations/state';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('controllableState tuple', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should destructure into a getter and setter like state()', () => {
    let setCount!: (next: number) => void;
    const changes: number[] = [];
    createIsland({
      root: container,
      component: () => {
        const [count, set] = controllableState({
          value: undefined,
          defaultValue: 1,
          onChange: (next: number) => changes.push(next),
        });
        setCount = set;
        return <output>{count()}</output>;
      },
    });
    flushScheduler();
    expect(container.textContent).toBe('1');

    setCount(2);
    flushScheduler();
    expect(container.textContent).toBe('2');
    expect(changes).toEqual([2]);
  });
});
