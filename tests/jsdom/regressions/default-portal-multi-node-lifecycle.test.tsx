import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { Portal } from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// NOTE: this file does NOT reproduce the specific "clearing a multi-node
// default-portal leaves stale DOM" finding from the review (component-
// range-commit.ts's replaceComponentRange bails to null for
// __askrAutoDefaultPortal hosts, and component-commit.ts's
// commitPlaceholderReplacement null-branch has no fallback for that case).
// Traced with debug instrumentation: the bail DOES fire exactly as
// described, but it turns out to be harmless in practice. The default
// portal host's first multi-node commit routes through
// commitPlaceholderReplacement's *non-null* branch, which wraps multiple
// root nodes in a host <div> (__ASKR_WRAPPER_HOST) and sets
// `instance.target` to it. Every subsequent commit - including the
// transition to null - therefore goes through commitToTarget instead, which
// DOES have a fallback (`if (!replacement) renderer.evaluate(result,
// target)`) that correctly clears the wrapper's children. The missing
// fallback in commitPlaceholderReplacement's null branch would only matter
// for an instance that renders null on its very first commit and stays
// null forever (nothing to clean up - harmless) or reaches null while still
// in `_placeholder` mode by some other path not exercised by ordinary
// <Portal>/<DefaultPortal> usage. This test instead pins the correct,
// verified end-to-end behavior (multi-node portal content is fully removed
// when cleared) as a regression guard.
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
                  <div class="toast" data-toast-id={String(toast.id)}>
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

    toasts!.set([]);
    flushScheduler();

    expect(document.querySelectorAll('.toast[data-toast-id]').length).toBe(0);
  });
});
