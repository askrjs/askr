import { afterEach, expect, test, vi } from 'vite-plus/test';
import { removeStaleAttributes } from '../../../src/renderer/props/attributes';

afterEach(() => vi.restoreAllMocks());

test.each([0, 1, 4, 24])(
  'should retain %s desired attributes while removing omitted ones',
  (count) => {
    const element = document.createElement('div');
    const props: Record<string, string> = {};
    for (let index = 0; index < count; index++) {
      const name = `data-keep-${index}`;
      props[name] = String(index);
      element.setAttribute(name, String(index));
    }
    element.setAttribute('data-stale-first', 'first');
    element.setAttribute('data-stale-second', 'second');
    removeStaleAttributes(element, {}, props);
    expect(element.getAttributeNames()).toEqual(Object.keys(props));
    for (const [name, value] of Object.entries(props))
      expect(element.getAttribute(name)).toBe(value);
  }
);

test('should remove the original stale attributes in order despite removal callbacks changing the collection', () => {
  const element = document.createElement('div');
  element.setAttribute('data-first', 'first');
  element.setAttribute('title', 'keep');
  element.setAttribute('data-second', 'second');
  element.setAttribute('data-third', 'third');
  const removed: string[] = [];
  const remove = element.removeAttribute.bind(element);
  vi.spyOn(element, 'removeAttribute').mockImplementation((name) => {
    removed.push(name);
    remove(name);
    if (name === 'data-first') {
      remove('data-second');
      element.setAttribute('data-added', 'added during removal');
    }
  });
  removeStaleAttributes(element, {}, { title: 'keep' });
  expect(removed).toEqual(['data-first', 'data-second', 'data-third']);
  expect(element.getAttributeNames()).toEqual(['title', 'data-added']);
});

test('should snapshot attributes after prop reads and before reading attribute names', () => {
  const element = document.createElement('div');
  element.setAttribute('data-first', 'first');
  element.setAttribute('data-second', 'second');
  const first = element.getAttributeNode('data-first')!;
  Object.defineProperty(first, 'name', {
    get() {
      element.removeAttribute('data-second');
      element.setAttribute('data-late', 'late');
      return 'data-first';
    },
  });
  const remove = vi.spyOn(element, 'removeAttribute');
  const props = {
    get title() {
      element.setAttribute('data-from-prop', 'prop');
      return 'keep';
    },
  };
  removeStaleAttributes(element, {}, props);
  expect(remove.mock.calls.map(([name]) => name)).toContain('data-from-prop');
  expect(
    remove.mock.calls.filter(([name]) => name === 'data-second')
  ).toHaveLength(3);
  expect(element.getAttributeNames()).toEqual(['data-late']);
});

test.each(['html', 'svg'])(
  'should preserve %s aliases, false ARIA values, reactive props, and keyed metadata',
  (kind) => {
    const element =
      kind === 'svg'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : document.createElement('div');
    element.setAttribute('class', 'keep');
    element.setAttribute('aria-hidden', 'false');
    element.setAttribute('title', 'reactive');
    element.setAttribute('data-key', '1');
    element.setAttribute('data-askr-key-kind', 'number');
    element.setAttribute('viewBox', '0 0 10 10');
    element.setAttribute('data-stale', 'stale');
    removeStaleAttributes(
      element,
      { key: 1 },
      {
        className: 'keep',
        'aria-hidden': false,
        title: () => 'reactive',
        viewBox: '0 0 10 10',
        onClick: () => {},
      }
    );
    expect(element.getAttributeNames()).toEqual([
      'class',
      'aria-hidden',
      'title',
      'data-key',
      'data-askr-key-kind',
      kind === 'svg' ? 'viewBox' : 'viewbox',
    ]);
  }
);
