import { describe, expect, it } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

describe('hydration render purity', () => {
  it('should leave adopted text nodes intact when hydration rendering fails', () => {
    const container = document.createElement('div');
    container.innerHTML = 'xy';
    const original = container.firstChild;
    expect(original?.nodeType).toBe(Node.TEXT_NODE);

    const root = createRoot(container, { hydrate: true });
    expect(() =>
      root.prepare([
        'x',
        'y',
        () => {
          throw new Error('render failed');
        },
      ])
    ).toThrow('render failed');

    expect(container.childNodes).toHaveLength(1);
    expect(container.firstChild).toBe(original);
    expect(container.textContent).toBe('xy');
    root.dispose();
  });

  it('should commit adjacent text descriptors from a merged server text node', () => {
    const container = document.createElement('div');
    container.innerHTML = 'xy';
    const original = container.firstChild;
    const root = createRoot(container, { hydrate: true });

    const prepared = root.prepare(['x', 'y']);
    expect(container.childNodes).toHaveLength(1);
    prepared.commit();

    expect(container.childNodes).toHaveLength(2);
    expect(container.firstChild).toBe(original);
    expect([...container.childNodes].map((node) => node.textContent)).toEqual([
      'x',
      'y',
    ]);
    root.dispose();
  });
});
