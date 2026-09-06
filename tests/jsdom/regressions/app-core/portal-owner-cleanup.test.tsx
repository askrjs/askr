import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../../src/foundations/structures/portal';
import { state } from '../../../../src/runtime/reactivity/state';
import { createIsland } from '../../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../../test-utils/render/test-renderer';

describe('portal owner cleanup regression', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should clear portal content when its writer component is removed', () => {
    function DialogWriter() {
      return (
        <Portal>
          <section role="dialog">Confirm removal</section>
        </Portal>
      );
    }

    function App() {
      const showDialog = state(true);

      return (
        <main>
          <button type="button" onClick={() => showDialog.set(false)}>
            Close
          </button>
          {showDialog() ? <DialogWriter /> : null}
        </main>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });
});
