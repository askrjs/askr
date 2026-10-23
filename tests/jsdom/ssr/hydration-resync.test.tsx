import { expect, test } from 'vite-plus/test';
import { createRoot } from '../../../src/core/dom/root';

function hydrate(html: string, client: unknown) {
  const container = document.createElement('div');
  container.innerHTML = html;
  const before = Array.from(container.childNodes);
  const root = createRoot(container, { hydrate: true });
  root.render(client);
  return { container, before, root };
}

function expectSame(container: Element, nodes: Node[]): void {
  const actual = Array.from(container.childNodes);
  expect(actual.length).toBe(nodes.length);
  actual.forEach((node, index) => expect(node === nodes[index]).toBe(true));
}

test('should keep the nodes after an extra server node', () => {
  const { container, before, root } = hydrate(
    '<i></i><b>b</b><p>p</p>',
    <>
      <b>b</b>
      <p>p</p>
    </>
  );
  expect(Array.from(container.childNodes)).toEqual([before[1], before[2]]);
  root.dispose();
});

test('should keep the nodes around an extra server node in the middle', () => {
  const { container, before, root } = hydrate(
    '<b>b</b><i></i><p>p</p>',
    <>
      <b>b</b>
      <p>p</p>
    </>
  );
  expect(Array.from(container.childNodes)).toEqual([before[0], before[2]]);
  root.dispose();
});

test('should keep the nodes after an extra client node', () => {
  const { container, before, root } = hydrate(
    '<b>b</b><p>p</p>',
    <>
      <i></i>
      <b>b</b>
      <p>p</p>
    </>
  );
  expect(container.childNodes[1]).toBe(before[0]);
  expect(container.childNodes[2]).toBe(before[1]);
  expect(container.childNodes[0]).not.toBe(before[0]);
  root.dispose();
});

test('should keep the trailing sibling when two siblings are swapped', () => {
  const { container, before, root } = hydrate(
    '<b>b</b><a>a</a><p>p</p>',
    <>
      <a>a</a>
      <b>b</b>
      <p>p</p>
    </>
  );
  expect(container.innerHTML).toBe('<a>a</a><b>b</b><p>p</p>');
  expect(container.lastChild).toBe(before[2]);
  const kept = Array.from(container.childNodes).filter((n) =>
    before.includes(n)
  );
  expect(kept.length).toBe(2);
  root.dispose();
});

test('should match mixed text and elements around an extra server element', () => {
  const { container, before, root } = hydrate(
    '<i>x</i>text<b>b</b>tail',
    <>
      text<b>b</b>tail
    </>
  );
  expect(Array.from(container.childNodes)).toEqual([
    before[1],
    before[2],
    before[3],
  ]);
  root.dispose();
});

test('should resync inside a nested element', () => {
  const container = document.createElement('div');
  container.innerHTML = '<div><i></i><b>b</b><p>p</p></div>';
  const serverB = container.querySelector('b');
  const serverP = container.querySelector('p');
  const root = createRoot(container, { hydrate: true });
  root.render(
    <div>
      <b>b</b>
      <p>p</p>
    </div>
  );
  const div = container.firstElementChild!;
  expect(div.innerHTML).toBe('<b>b</b><p>p</p>');
  expect(div.children[0] === serverB).toBe(true);
  expect(div.children[1] === serverP).toBe(true);
  root.dispose();
});
