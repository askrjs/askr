import { expect, test, vi } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

function rows(count: number) {
  return Array.from({ length: count }, (_, i) => <li key={i}>{i}</li>);
}

test('should clear every child of a host with one operation', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(<ul>{rows(100)}</ul>);
  const list = container.querySelector('ul')!;
  expect(list.childNodes.length).toBe(100);
  const removeChild = vi.spyOn(Node.prototype, 'removeChild');
  const replaceChildren = vi.spyOn(Element.prototype, 'replaceChildren');
  try {
    root.render(<ul>{rows(0)}</ul>);
    expect(list.childNodes.length).toBe(0);
    expect(removeChild).not.toHaveBeenCalled();
    expect(replaceChildren).toHaveBeenCalledTimes(1);
  } finally {
    vi.restoreAllMocks();
    root.dispose();
  }
});

test('should keep a node other code added when clearing a host', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(<ul>{rows(5)}</ul>);
  const list = container.querySelector('ul')!;
  const foreign = document.createElement('li');
  foreign.id = 'foreign';
  list.appendChild(foreign);
  root.render(<ul>{rows(0)}</ul>);
  expect(Array.from(list.childNodes)).toEqual([foreign]);
  expect(list.firstChild === foreign).toBe(true);
  root.dispose();
});

test('should restore the cleared children in order when the commit fails', () => {
  const container = document.createElement('div');
  const root = createRoot(container);
  root.render(
    <div>
      <ul>{rows(10)}</ul>
      <p title="old">p</p>
    </div>
  );
  const list = container.querySelector('ul')!;
  const before = Array.from(list.childNodes);
  const paragraph = container.querySelector('p')!;
  const setAttribute = paragraph.setAttribute.bind(paragraph);
  const failure = new Error('write failed');
  vi.spyOn(paragraph, 'setAttribute').mockImplementation((name, value) => {
    if (name === 'title' && value === 'new') throw failure;
    setAttribute(name, value);
  });
  const prepared = root.prepare(
    <div>
      <ul>{rows(0)}</ul>
      <p title="new">p</p>
    </div>
  );
  try {
    expect(() => prepared.commit()).toThrow(failure);
    const after = Array.from(list.childNodes);
    expect(after.length).toBe(10);
    after.forEach((node, i) => expect(node === before[i]).toBe(true));
    expect(paragraph.getAttribute('title')).toBe('old');
  } finally {
    vi.restoreAllMocks();
    root.dispose();
  }
});
