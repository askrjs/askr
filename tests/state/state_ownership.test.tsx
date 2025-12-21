import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createIsland, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('state ownership invariants', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should record its owning component and remain stable', () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(0);
      return { type: 'div', children: [`${count!()}`] };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // owner metadata should exist
    const owner = (count as any)?._owner;
    expect(owner).toBeTruthy();

    // performing an update should not change owner
    const beforeOwner = owner;
    count!.set(1);
    flushScheduler();
    expect((count as any)._owner).toBe(beforeOwner);
  });
});
