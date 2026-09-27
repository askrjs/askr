import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration form control rollback', () => {
  it('should restore adopted value and checked state when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<input id="first" value="old" checked>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first') as HTMLInputElement;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <input key="first" id="first" value="new" checked={false} />,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.value).toBe('old');
    expect(first.getAttribute('value')).toBe('old');
    expect(first.checked).toBe(true);
    expect(first.hasAttribute('checked')).toBe(true);
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore an adopted option selection when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<select><option id="first" selected>first</option></select>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first') as HTMLOptionElement;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <select key="select">
        <option id="first" selected={false}>
          first
        </option>
      </select>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.selected).toBe(true);
    expect(first.hasAttribute('selected')).toBe(true);
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore an adopted checked state when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<input id="first" type="checkbox" checked>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first') as HTMLInputElement;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <input key="first" id="first" type="checkbox" checked={false} />,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.checked).toBe(true);
    expect(first.hasAttribute('checked')).toBe(true);
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore bound adopted controls when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<input id="first" type="checkbox" value="old" checked>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first') as HTMLInputElement;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <input
        key="first"
        id="first"
        type="checkbox"
        value={() => 'new'}
        checked={() => false}
      />,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.value).toBe('old');
    expect(first.getAttribute('value')).toBe('old');
    expect(first.checked).toBe(true);
    expect(first.hasAttribute('checked')).toBe(true);
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });

  it('should restore a bound adopted option selection when a later prop write fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<select><option id="first" selected>first</option></select>' +
      '<button id="second" data-mode="old">second</button>';
    const first = container.querySelector('#first') as HTMLOptionElement;
    const second = container.querySelector('#second')!;
    const setAttribute = second.setAttribute.bind(second);
    const failure = new Error('hydration attribute write failed');
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'data-mode' && value === 'new') throw failure;
      setAttribute(name, value);
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <select key="select">
        <option id="first" selected={() => false}>
          first
        </option>
      </select>,
      <button key="second" id="second" data-mode="new">
        second
      </button>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect(first.selected).toBe(true);
    expect(first.hasAttribute('selected')).toBe(true);
    expect(second.getAttribute('data-mode')).toBe('old');
    root.dispose();
  });
});
