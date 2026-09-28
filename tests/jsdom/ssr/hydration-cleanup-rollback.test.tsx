import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration cleanup rollback', () => {
  it('should restore removed server attributes when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<div id="first" data-server-only="yes">first</div>' +
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
      <div key="first" id="first">
        first
      </div>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('data-server-only')).toBe('yes');
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore corrected server text when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<p id="first">server text</p>' +
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
      <p key="first" id="first">
        client text
      </p>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.textContent).toBe('server text');
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore removed server attributes when their removal throws', () => {
    const container = document.createElement('div');
    container.innerHTML = '<div id="first" data-server-only="yes">first</div>';
    const first = container.querySelector('#first')!;
    const removeAttribute = first.removeAttribute.bind(first);
    const failure = new Error('server attribute removal failed');
    vi.spyOn(first, 'removeAttribute').mockImplementation((name) => {
      removeAttribute(name);
      if (name === 'data-server-only') throw failure;
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(<div id="first">first</div>);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.getAttribute('data-server-only')).toBe('yes');
    root.dispose();
  });
});
