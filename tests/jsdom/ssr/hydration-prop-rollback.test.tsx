import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration prop rollback', () => {
  it('should restore earlier adopted attributes when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<button id="first" data-mode="old">first</button>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first')!;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <button key="first" id="first" data-mode="new">
        first
      </button>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('data-mode')).toBe('old');
    expect(second.getAttribute('data-mode')).toBe('old');
    expect(container.textContent).toBe('firstsecond');
    root.dispose();
  });
});
