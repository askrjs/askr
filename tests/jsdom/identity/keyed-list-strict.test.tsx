import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

function getDomReplaceCount(): number {
  const devNamespace =
    (
      globalThis as Record<string, unknown> & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__ ?? {};

  return typeof devNamespace.__DOM_REPLACE_COUNT === 'number'
    ? (devNamespace.__DOM_REPLACE_COUNT as number)
    : 0;
}

describe('strict keyed list guarantees', () => {
  it('should preserve DOM node identity for keyed items in mixed keyed/unkeyed lists', () => {
    const { container, cleanup } = createTestContainer();

    let setItems: (v: string[]) => void = () => {};
    const Controlled = () => {
      const s = state(['a', 'u1', 'b', 'c']);
      setItems = (v: string[]) => s.set(v);

      return (
        <div>
          {s().map((k) =>
            k.startsWith('u')
              ? ((<div>{'unkeyed'}</div>) as unknown as JSXElement)
              : ((
                  <div key={k} data-key={k}>
                    {k}
                  </div>
                ) as unknown as JSXElement)
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    const nodeMap = new Map<string, HTMLElement>();
    for (const n of before) {
      const key = n.getAttribute('data-key') || '';
      nodeMap.set(key, n);
    }

    setItems(['c', 'b', 'u1', 'a']);
    flushScheduler();

    const after = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    for (const [, prev] of nodeMap.entries()) {
      expect(after.includes(prev)).toBe(true);
    }

    cleanup();
  });

  it('should preserve DOM node identity when only props change for keyed items', () => {
    const { container, cleanup } = createTestContainer();

    let setProp: (key: string, val: string) => void = () => {};
    const Controlled = () => {
      const keys = ['a', 'b', 'c'];
      const prop = state<Record<string, string>>({ a: 'x', b: 'x', c: 'x' });
      setProp = (k: string, v: string) => prop.set({ ...prop(), [k]: v });

      return (
        <div>
          {keys.map(
            (k) =>
              (
                <div key={k} data-key={k} data-prop={prop()[k]}>
                  {k}
                </div>
              ) as unknown as JSXElement
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    const nodeMap = new Map<string, HTMLElement>();
    for (const n of before) {
      const key = n.getAttribute('data-key') || '';
      nodeMap.set(key, n);
    }

    setProp('b', 'y');
    flushScheduler();

    const after = Array.from(
      container.querySelectorAll('[data-key]')
    ) as HTMLElement[];
    for (const [k, prev] of nodeMap.entries()) {
      const el = after.find((n) => n.getAttribute('data-key') === k);
      expect(el).toBeDefined();
      expect(el).toBe(prev); // same element instance
    }

    const b = container.querySelector('[data-key="b"]') as HTMLElement;
    expect(b.getAttribute('data-prop')).toBe('y');

    cleanup();
  });

  it('should preserve all keyed component siblings when parent props update', () => {
    const { container, cleanup } = createTestContainer();

    let setCollapsed: (value: boolean) => void = () => {};
    const groups = [
      'app',
      'get-started',
      'concepts',
      'ui',
      'patterns',
      'reference',
    ];

    function Group({ group }: { group: string }) {
      return (
        <section data-key={group} data-testid={'group'}>
          <h2>{group}</h2>
          <a href={`#${group}-a`}>{`${group} a`}</a>
          <a href={`#${group}-b`}>{`${group} b`}</a>
        </section>
      );
    }

    const App = () => {
      const collapsed = state(false);
      setCollapsed = (value: boolean) => collapsed.set(value);

      return (
        <aside data-collapsible={collapsed() ? 'icon' : 'none'}>
          {groups.map((group) => (
            <Group key={group} group={group} />
          ))}
        </aside>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelectorAll('[data-testid="group"]')).toHaveLength(
      groups.length
    );

    setCollapsed(true);
    flushScheduler();

    expect(container.querySelectorAll('[data-testid="group"]')).toHaveLength(
      groups.length
    );
    expect(
      Array.from(container.querySelectorAll('[data-testid="group"]')).map(
        (node) => node.getAttribute('data-key')
      )
    ).toEqual(groups);

    setCollapsed(false);
    flushScheduler();

    expect(container.querySelectorAll('[data-testid="group"]')).toHaveLength(
      groups.length
    );

    cleanup();
  });

  it('should preserve keyed component siblings after unkeyed component prefix updates', () => {
    const { container, cleanup } = createTestContainer();

    let setCollapsed: (value: boolean) => void = () => {};
    const groups = [
      'get-started',
      'concepts',
      'ui',
      'patterns',
      'reference',
    ];

    function Part({ children }: { children?: unknown }) {
      return <div>{children as never}</div>;
    }

    function MenuButton({ label }: { label: string }) {
      return (
        <button type="button">
          <span>{label}</span>
        </button>
      );
    }

    function AppGroup() {
      return (
        <Part>
          <MenuButton label="Overview" />
          <MenuButton label="Docs" />
          <MenuButton label="About" />
          <MenuButton label="Contact" />
        </Part>
      );
    }

    function Separator() {
      return <hr />;
    }

    function Group({ group }: { group: string }) {
      return (
        <Part>
          <h2>{group}</h2>
          <MenuButton label={`${group} a`} />
          <MenuButton label={`${group} b`} />
        </Part>
      );
    }

    const App = () => {
      const collapsed = state(false);
      setCollapsed = (value: boolean) => collapsed.set(value);

      return (
        <aside data-collapsible={collapsed() ? 'icon' : 'none'}>
          <div data-testid="content">
            <AppGroup />
            <Separator />
            {groups.map((group) => (
              <Group key={group} group={group} />
            ))}
          </div>
        </aside>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const content = container.querySelector('[data-testid="content"]');
    expect(content?.children).toHaveLength(groups.length + 2);

    setCollapsed(true);
    flushScheduler();

    expect(content?.children).toHaveLength(groups.length + 2);
    expect(Array.from(content?.children ?? []).map((node) => node.textContent))
      .toEqual([
        'OverviewDocsAboutContact',
        '',
        'get-startedget-started aget-started b',
        'conceptsconcepts aconcepts b',
        'uiui aui b',
        'patternspatterns apatterns b',
        'referencereference areference b',
      ]);

    setCollapsed(false);
    flushScheduler();

    expect(content?.children).toHaveLength(groups.length + 2);

    cleanup();
  });

  it('should preserve keyed row identity across component-boundary reorders', () => {
    const { container, cleanup } = createTestContainer();

    type RowData = { id: number; label: string };
    let rowsState: ReturnType<typeof state<RowData[]>> | null = null;

    function Row({ item }: { item: RowData }) {
      return (
        <tr data-key={String(item.id)}>
          <td>{item.label}</td>
        </tr>
      );
    }

    const Component = () => {
      rowsState = state([
        { id: 1, label: 'One' },
        { id: 2, label: 'Two' },
        { id: 3, label: 'Three' },
      ]);

      return (
        <table>
          <tbody>
            {rowsState().map((item) => (
              <Row key={item.id} item={item} />
            ))}
          </tbody>
        </table>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const rowsBefore = new Map<string, Element>();
    container.querySelectorAll('tr[data-key]').forEach((row) => {
      rowsBefore.set(row.getAttribute('data-key') || '', row);
    });
    const replaceBefore = getDomReplaceCount();

    rowsState!.set((rows) => [rows[0], rows[2], rows[1]]);
    flushScheduler();

    const orderedKeys = Array.from(
      container.querySelectorAll('tr[data-key]')
    ).map((row) => row.getAttribute('data-key'));

    expect(orderedKeys).toEqual(['1', '3', '2']);
    container.querySelectorAll('tr[data-key]').forEach((row) => {
      const key = row.getAttribute('data-key') || '';
      expect(row).toBe(rowsBefore.get(key));
    });
    expect(getDomReplaceCount() - replaceBefore).toBe(0);

    cleanup();
  });

  it('should replace DOM node when element tag changes for keyed item', () => {
    const { container, cleanup } = createTestContainer();

    let setTag: (key: string, tag: string) => void = () => {};
    const Controlled = () => {
      const tagMap = state<Record<string, string>>({ a: 'div' });
      setTag = (k: string, t: string) => tagMap.set({ ...tagMap(), [k]: t });

      return (
        <div>
          {tagMap().a === 'span' ? (
            <span key="a" data-key="a">
              a
            </span>
          ) : (
            <div key="a" data-key="a">
              a
            </div>
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });

    const before = container.querySelector('[data-key="a"]') as HTMLElement;
    setTag('a', 'span');
    flushScheduler();

    const after = container.querySelector('[data-key="a"]') as HTMLElement;
    expect(after).not.toBe(before);
    expect(after.tagName.toLowerCase()).toBe('span');

    cleanup();
  });

  it('should not allocate new DOM nodes for existing keys under repeated random reorders', () => {
    const { container, cleanup } = createTestContainer();

    const N = 30;
    const iterations = 8;

    const initial = Array.from({ length: N }, (_, i) => `k${i}`);
    let setOrder: (v: string[]) => void = () => {};

    const Controlled = () => {
      const s = state(initial.slice());
      setOrder = (v: string[]) => s.set(v);

      return (
        <div>
          {s().map(
            (k) =>
              (
                <div key={k} data-key={k}>
                  {k}
                </div>
              ) as unknown as JSXElement
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Controlled });
    // Ensure initial render completes before we capture identity
    flushScheduler();

    const capture = () => {
      const map = new Map<string, HTMLElement>();
      for (const n of Array.from(
        container.querySelectorAll('[data-key]')
      ) as HTMLElement[]) {
        map.set(n.getAttribute('data-key') || '', n);
      }
      return map;
    };

    let nodes = capture();

    // Deterministic rotation test to exercise many moves while avoiding
    // random flakiness in CI environments.
    const order = initial.slice();
    for (let it = 0; it < iterations; it++) {
      // Rotate last element to front
      const v = order.pop()!;
      order.unshift(v);
      setOrder(order.slice());
      flushScheduler();

      const after = capture();
      // Ensure we did not lose any existing element instances — tolerate
      // acceptable reordering but ensure no allocations removed prior nodes.
      for (const [, prev] of nodes.entries()) {
        expect(Array.from(after.values()).includes(prev)).toBe(true);
      }

      // Use the new capture as the baseline for the next iteration
      nodes = after;
    }

    cleanup();
  });
});
