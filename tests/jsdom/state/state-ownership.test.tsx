import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state } from '../../../src/index';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('state ownership invariants', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });
  afterEach(() => cleanup());

  it('should retain the same state cell across renders of its component', () => {
    let count: ReturnType<typeof state<number>> | null = null;
    const Component = () => {
      count = state(0);
      return <div>{String(count!())}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const firstCell = count;
    count!.set(1);
    flushScheduler();
    expect(count).toBe(firstCell);
    expect(container.textContent).toBe('1');
  });
});
