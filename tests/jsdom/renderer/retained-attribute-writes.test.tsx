import { expect, test } from 'vite-plus/test';
import { For, state, type State } from '../../../src';
import { applyScalarPropValue } from '../../../src/renderer/props/attributes';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

test('should retain list attributes without rewriting them while updating row callbacks', () => {
  const { container, cleanup } = createTestContainer();
  let rows!: State<Array<{ id: number; revision: number }>>;
  const renders: number[] = [];
  const clicks: number[] = [];
  function Row({ row }: { row: { id: number; revision: number } }) {
    renders.push(row.revision);
    return (
      <button
        class="row fixed"
        title="unchanged"
        data-row={row.id}
        aria-label="Select row"
        onClick={() => clicks.push(row.revision)}
      >
        Row
      </button>
    );
  }
  function App() {
    rows = state([{ id: 1, revision: 0 }]);
    return (
      <div>
        <For each={() => rows()} by={(row) => row.id}>
          {(row) => <Row row={row} />}
        </For>
      </div>
    );
  }
  const observer = new MutationObserver(() => {});
  try {
    createIsland({ root: container, component: App });
    flushScheduler();
    const button = container.querySelector('button')!;
    observer.observe(button, { attributes: true });
    rows.set([{ id: 1, revision: 1 }]);
    flushScheduler();
    expect(container.querySelector('button')).toBe(button);
    expect(renders).toEqual([0, 1]);
    button.click();
    expect(clicks).toEqual([1]);
    expect(
      observer.takeRecords().map((record) => record.attributeName)
    ).toEqual([]);
  } finally {
    observer.disconnect();
    cleanup();
  }
});

test.each(['html', 'svg'])(
  'should skip equal %s scalar attributes and repair external changes',
  (kind) => {
    const element =
      kind === 'svg'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : document.createElement('div');
    const props = {
      className: 'row fixed',
      title: 'title',
      'aria-hidden': false,
      tabIndex: 0,
    };
    for (const [key, value] of Object.entries(props))
      applyScalarPropValue(element, key, value, element.localName);
    const observer = new MutationObserver(() => {});
    observer.observe(element, { attributes: true });
    try {
      for (const [key, value] of Object.entries(props))
        applyScalarPropValue(element, key, value, element.localName);
      expect(observer.takeRecords()).toEqual([]);

      element.setAttribute('class', 'external');
      element.setAttribute('title', 'external');
      observer.takeRecords();
      for (const [key, value] of Object.entries(props))
        applyScalarPropValue(element, key, value, element.localName);
      expect(element.getAttribute('class')).toBe('row fixed');
      expect(element.getAttribute('title')).toBe('title');
      expect(
        observer.takeRecords().map((record) => record.attributeName)
      ).toEqual(['class', 'title']);
    } finally {
      observer.disconnect();
    }
  }
);

test.each(['html', 'svg'])(
  'should preserve empty %s class attribute semantics',
  (kind) => {
    const element =
      kind === 'svg'
        ? document.createElementNS('http://www.w3.org/2000/svg', 'svg')
        : document.createElement('div');
    applyScalarPropValue(element, 'class', '', element.localName);
    expect(element.getAttribute('class')).toBe(kind === 'svg' ? null : '');
    element.setAttribute('class', '');
    applyScalarPropValue(element, 'class', '', element.localName);
    expect(element.getAttribute('class')).toBe(kind === 'svg' ? null : '');
  }
);
