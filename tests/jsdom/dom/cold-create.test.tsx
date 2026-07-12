import { describe, expect, it, vi } from 'vite-plus/test';
import { For } from '../../../src/control';
import { createDOMNode } from '../../../src/renderer/dom';
import { createDetachedRange } from '../../../src/renderer/dom-range';
import { state, type State } from '../../../src/runtime/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('cold DOM construction', () => {
  it('should keep singleton detached ranges fragment-free', () => {
    const node = document.createElement('div');
    const createFragment = vi.spyOn(document, 'createDocumentFragment');

    const materialized = createDetachedRange(node);

    expect(materialized.range).toEqual({
      start: node,
      end: node,
      single: true,
    });
    expect(materialized.fragment).toBeNull();
    expect(node.parentNode).toBeNull();
    expect(createFragment).not.toHaveBeenCalled();
  });

  it('should append multiple children directly into a detached intrinsic', () => {
    const createFragment = vi.spyOn(document, 'createDocumentFragment');

    const node = createDOMNode(
      <div>
        <span>one</span>
        <span>two</span>
      </div>
    );

    expect(node).toBeInstanceOf(HTMLDivElement);
    expect((node as HTMLDivElement).textContent).toBe('onetwo');
    expect(createFragment).not.toHaveBeenCalled();
  });

  it('should reuse a validated component blueprint with fresh bindings and ownership', () => {
    type Row = { id: number; label: string; active: boolean };

    let rows!: State<Row[]>;
    const selected: number[] = [];
    const cloneNode = vi.spyOn(Node.prototype, 'cloneNode');
    const { container, cleanup } = createTestContainer();

    function RowView({ row }: { row: Row }) {
      return (
        <button
          class={() => (row.active ? 'active' : '')}
          onClick={() => selected.push(row.id)}
        >
          <span>{() => row.label}</span>
        </button>
      );
    }

    function App() {
      rows = state<Row[]>([
        { id: 1, label: 'one', active: false },
        { id: 2, label: 'two', active: true },
      ]);
      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => <RowView row={row} />}
        </For>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const firstButtons = Array.from(container.querySelectorAll('button'));
      expect(firstButtons.map((button) => button.textContent)).toEqual([
        'one',
        'two',
      ]);
      expect(firstButtons[0]).not.toBe(firstButtons[1]);
      expect(firstButtons[1]?.className).toBe('active');
      expect(cloneNode).toHaveBeenCalled();

      firstButtons[1]?.click();
      expect(selected).toEqual([2]);

      rows.set([
        { id: 1, label: 'ONE', active: true },
        { id: 2, label: 'TWO', active: false },
      ]);
      flushScheduler();

      const secondButtons = Array.from(container.querySelectorAll('button'));
      expect(secondButtons.map((button) => button.textContent)).toEqual([
        'ONE',
        'TWO',
      ]);
      expect(secondButtons[0]?.className).toBe('active');
      expect(secondButtons[1]?.className).toBe('');
    } finally {
      cleanup();
    }
  });

  it('should reuse a validated intrinsic blueprint across direct For item rows', () => {
    type Row = { id: number; label: string; active: boolean };

    let rows!: State<Row[]>;
    const selected: number[] = [];
    const cloneNode = vi.spyOn(Node.prototype, 'cloneNode');
    const { container, cleanup } = createTestContainer();

    function App() {
      rows = state<Row[]>([
        { id: 1, label: 'one', active: false },
        { id: 2, label: 'two', active: true },
      ]);
      return (
        <For each={rows} by={(row) => row.id}>
          {(row) => (
            <button
              class={() => (row.active ? 'active' : '')}
              title={() => row.label}
              onClick={() => selected.push(row.id)}
            >
              <span>{() => row.label}</span>
            </button>
          )}
        </For>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const firstButtons = Array.from(container.querySelectorAll('button'));
      expect(firstButtons.map((button) => button.textContent)).toEqual([
        'one',
        'two',
      ]);
      expect(firstButtons.map((button) => button.dataset.key)).toEqual([
        '1',
        '2',
      ]);
      expect(
        firstButtons.map((button) => button.dataset.askrKeyKind)
      ).toEqual(['number', 'number']);
      expect(firstButtons[1]?.className).toBe('active');
      expect(firstButtons.map((button) => button.title)).toEqual([
        'one',
        'two',
      ]);
      expect(cloneNode).toHaveBeenCalled();

      firstButtons[1]?.click();
      expect(selected).toEqual([2]);

      rows.set([
        { id: 1, label: 'ONE', active: true },
        { id: 2, label: 'TWO', active: false },
      ]);
      flushScheduler();

      const secondButtons = Array.from(container.querySelectorAll('button'));
      expect(secondButtons).toEqual(firstButtons);
      expect(secondButtons.map((button) => button.textContent)).toEqual([
        'ONE',
        'TWO',
      ]);
      expect(secondButtons[0]?.className).toBe('active');
      expect(secondButtons[1]?.className).toBe('');
      expect(secondButtons.map((button) => button.title)).toEqual([
        'ONE',
        'TWO',
      ]);
    } finally {
      cleanup();
    }
  });

  it('should fall back when a component intrinsic shape or static prop changes', () => {
    function Variant({
      article,
      tone,
    }: {
      article: boolean;
      tone: string;
    }) {
      return article ? (
        <article data-tone={tone}>
          <span>{'article'}</span>
        </article>
      ) : (
        <section data-tone={tone}>
          <span>{'section'}</span>
        </section>
      );
    }

    const dom = createDOMNode([
      <Variant key={'first'} article={true} tone={'first'} />,
      <Variant key={'second'} article={false} tone={'second'} />,
      <Variant key={'third'} article={true} tone={'third'} />,
    ]) as DocumentFragment;

    expect(
      Array.from(dom.children).map((element) => [
        element.tagName,
        element.getAttribute('data-tone'),
        element.textContent,
      ])
    ).toEqual([
      ['ARTICLE', 'first', 'article'],
      ['SECTION', 'second', 'section'],
      ['ARTICLE', 'third', 'article'],
    ]);
  });
});
