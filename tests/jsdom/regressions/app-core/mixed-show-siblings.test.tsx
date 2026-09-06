import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Show } from '../../../../src/control';
import { state } from '../../../../src/runtime/reactivity/state';
import { createIsland } from '../../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';

describe('mixed Show sibling regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should preserve form siblings when a Show branch changes', () => {
    function App() {
      const saving = state(false);

      return (
        <form aria-label="Settings">
          <label>
            Display name
            <input aria-label="Display name" />
          </label>
          <button type="button" onClick={() => saving.set(true)}>
            Save
          </button>
          <Show when={() => saving()} fallback={<p>Ready</p>}>
            <p>Saving...</p>
          </Show>
        </form>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    const input = container.querySelector(
      '[aria-label="Display name"]'
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(container.textContent).toContain('Ready');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.querySelector('[aria-label="Display name"]')).toBe(input);
    expect(container.textContent).toContain('Saving...');
  });
});
