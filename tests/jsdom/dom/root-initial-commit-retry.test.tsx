import { describe, expect, it, vi } from 'vite-plus/test';
import { CommitMutationError } from '../../../src/core/dom/pass';
import { createRoot } from '../../../src/core/dom/root';

describe('initial root commit retry', () => {
  it('should keep a fresh root unmounted when initial placement aborts', () => {
    const container = document.createElement('div');
    container.innerHTML = '<aside>existing</aside>';
    const existing = container.firstChild;
    const replaceChildren = container.replaceChildren.bind(container);
    const abort = new CommitMutationError(
      new Error('initial placement failed')
    );
    let shouldAbort = true;
    vi.spyOn(container, 'replaceChildren').mockImplementation((...nodes) => {
      replaceChildren(...nodes);
      if (shouldAbort) {
        shouldAbort = false;
        throw abort;
      }
    });

    const root = createRoot(container);
    const view = <section id="new-root">new</section>;
    expect(() => root.prepare(view).commit()).toThrow(abort.failure);
    expect(container.firstChild).toBe(existing);

    root.prepare(view).commit();
    expect(container.querySelectorAll('#new-root')).toHaveLength(1);
    expect(container.querySelector('aside')).toBeNull();
    root.dispose();
  });
});
