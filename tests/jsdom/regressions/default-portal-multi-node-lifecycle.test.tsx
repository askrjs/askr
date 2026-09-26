import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Portal } from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  allowFrameworkWarnings,
  getCapturedFrameworkWarnings,
} from '../../setup-env';

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

  it('should warn about an unkeyed list in the automatic host and still clear it', () => {
    allowFrameworkWarnings(/Missing keys on dynamic lists/);
    let toasts: ReturnType<typeof state<string[]>> | null = null;

    const Component = () => {
      toasts = state(['Saved', 'Uploaded']);
      return (
        <div>
          <Portal>
            {toasts!().length > 0
              ? toasts!().map((text) => <p class="toast">{text}</p>)
              : undefined}
          </Portal>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // The automatic host reconciles like an explicit DefaultPortal host, so
    // an unkeyed dynamic list gets the same development warning.
    expect(getCapturedFrameworkWarnings().join('\n')).toContain(
      'Missing keys on dynamic lists'
    );
    expect(document.querySelectorAll('.toast').length).toBe(2);

    toasts!.set([]);
    flushScheduler();

    expect(document.querySelectorAll('.toast').length).toBe(0);
  });
});
