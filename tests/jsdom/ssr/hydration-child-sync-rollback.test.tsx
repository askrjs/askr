import { describe, expect, it, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration child sync rollback', () => {
  it('should restore adopted root children when removal partially mutates and fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<button id="button" data-mode="old">button</button>' +
      '<span id="extra">server only</span>';
    const originalChildren = Array.from(container.childNodes);
    const extra = container.querySelector('#extra')!;
    const removeChild = container.removeChild.bind(container);
    const failure = new Error('hydration prop write failed');
    vi.spyOn(container, 'removeChild').mockImplementation((child) => {
      const removed = removeChild(child);
      if (child === extra) throw failure;
      return removed;
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(
      <button id="button" data-mode="old">
        button
      </button>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect([...container.childNodes]).toEqual(originalChildren);
    expect(root.node.children).toHaveLength(0);
    root.dispose();
  });

  it('should restore adopted root order when insertion partially mutates and fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<span id="first">first</span><span id="second">second</span>';
    const originalChildren = Array.from(container.childNodes);
    const first = container.querySelector('#first')!;
    const insertBefore = container.insertBefore.bind(container);
    const failure = new Error('hydration insertion failed');
    vi.spyOn(container, 'insertBefore').mockImplementation((node, before) => {
      const inserted = insertBefore(node, before);
      if ((node as Element).tagName === 'STRONG' && before === first)
        throw failure;
      return inserted;
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare([
      <strong key="fresh">fresh</strong>,
      <span key="first" id="first">
        first
      </span>,
      <span key="second" id="second">
        second
      </span>,
    ]);

    expect(() => prepared.commit()).toThrow(failure);
    expect([...container.childNodes]).toEqual(originalChildren);
    expect(root.node.children).toHaveLength(0);
    root.dispose();
  });

  it('should restore nested adopted children when removal partially mutates and fails', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<section id="parent"><button>button</button><span id="extra">extra</span></section>';
    const parent = container.querySelector('#parent')!;
    const originalChildren = Array.from(parent.childNodes);
    const extra = parent.querySelector('#extra')!;
    const removeChild = parent.removeChild.bind(parent);
    const failure = new Error('nested hydration removal failed');
    vi.spyOn(parent, 'removeChild').mockImplementation((child) => {
      const removed = removeChild(child);
      if (child === extra) throw failure;
      return removed;
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(
      <section id="parent">
        <button>button</button>
      </section>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect([...parent.childNodes]).toEqual(originalChildren);
    expect(root.node.children).toHaveLength(0);
    root.dispose();
  });

  it('should restore nested sync when a later root sync aborts', () => {
    const container = document.createElement('div');
    container.innerHTML =
      '<section id="parent"><button>button</button><span id="inner-extra">inner</span></section>' +
      '<span id="outer-extra">outer</span>';
    const originalRootChildren = Array.from(container.childNodes);
    const parent = container.querySelector('#parent')!;
    const originalNestedChildren = Array.from(parent.childNodes);
    const outerExtra = container.querySelector('#outer-extra')!;
    const removeChild = container.removeChild.bind(container);
    const failure = new Error('root hydration removal failed');
    vi.spyOn(container, 'removeChild').mockImplementation((child) => {
      const removed = removeChild(child);
      if (child === outerExtra) throw failure;
      return removed;
    });

    const root = createRoot(container, { hydrate: true });
    const prepared = root.prepare(
      <section id="parent">
        <button>button</button>
      </section>
    );

    expect(() => prepared.commit()).toThrow(failure);
    expect([...container.childNodes]).toEqual(originalRootChildren);
    expect([...parent.childNodes]).toEqual(originalNestedChildren);
    expect(root.node.children).toHaveLength(0);
    root.dispose();
  });
});
