import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { controllableState } from '@askrjs/askr/foundations';
import { createIsland } from '../helpers/create-island';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('controllableState (FOUNDATIONS)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const next = createTestContainer();
    container = next.container;
    cleanup = next.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should call onChange when controlled set() is called', () => {
    const onChange = vi.fn<(next: number) => void>();

    const App = () => {
      const count = controllableState({ value: 1, defaultValue: 0, onChange });
      return (
        <button
          type="button"
          onClick={() => {
            count.set(2);
          }}
        />
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const button = container.querySelector('button') as HTMLButtonElement;
    button.click();
    flushScheduler();

    expect(onChange).toHaveBeenCalledWith(2);
  });
});
