import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Portal } from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// The automatic default-portal host commits multi-node content as an anchored
// range after the application root, like an explicit host, rather than inside
// a wrapper element. Clearing the content must remove every portaled node.
describe('default-portal-multi-node-clear', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const ctx = createTestContainer();
    container = ctx.container;
    cleanup = ctx.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should remove all portaled DOM when multi-node portal content is cleared', () => {
    let toasts: ReturnType<
      typeof state<Array<{ id: number; text: string }>>
    > | null = null;

    const Component = () => {
      toasts = state([
        { id: 1, text: 'Saved' },
        { id: 2, text: 'Uploaded' },
      ]);

      return (
        <div>
          <Portal>
            {toasts!().length > 0
              ? toasts!().map((toast) => (
                  <div
                    key={toast.id}
                    class="toast"
                    data-toast-id={String(toast.id)}
                  >
                    {toast.text}
                  </div>
                ))
              : undefined}
          </Portal>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(document.querySelectorAll('.toast[data-toast-id]').length).toBe(2);
    expect(
      Array.from(container.children, (element) => element.tagName)
    ).toEqual(['DIV', 'DIV', 'DIV']);

    toasts!.set([]);
    flushScheduler();

    expect(document.querySelectorAll('.toast[data-toast-id]').length).toBe(0);
  });
});
