import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { For } from '../../../src/control';

describe('identity edge cases', () => {
  it('should keep numeric and string keys as distinct identities', () => {
    const { container, cleanup } = createTestContainer();
    let items: ReturnType<
      typeof state<Array<{ key: string | number; label: string }>>
    >;

    const Component = () => {
      items = state([
        { key: 1, label: 'number' },
        { key: '1', label: 'string' },
      ]);
      return (
        <div>
          {items().map((item) => (
            <span key={item.key} data-label={item.label}>
              {item.label}
            </span>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const numberNode = container.querySelector('[data-label="number"]');
    const stringNode = container.querySelector('[data-label="string"]');
    expect(numberNode).not.toBeNull();
    expect(stringNode).not.toBeNull();
    expect(numberNode).not.toBe(stringNode);

    items!.set([
      { key: '1', label: 'string next' },
      { key: 1, label: 'number next' },
    ]);
    flushScheduler();

    const nextNumberNode = container.querySelector(
      '[data-label="number next"]'
    );
    const nextStringNode = container.querySelector(
      '[data-label="string next"]'
    );
    expect(nextNumberNode).toBe(numberNode);
    expect(nextStringNode).toBe(stringNode);
    expect(container.textContent).toBe('string nextnumber next');
    cleanup();
  });

  it('should keep numeric and string keys distinct through a large keyed reorder', () => {
    const { container, cleanup } = createTestContainer();
    let items: ReturnType<
      typeof state<Array<{ key: string | number; label: string }>>
    >;
    const initial = [
      { key: 1, label: 'number' },
      { key: '1', label: 'string' },
      ...Array.from({ length: 64 }, (_, index) => ({
        key: `key-${index}`,
        label: `item-${index}`,
      })),
    ];

    const Component = () => {
      items = state(initial);
      return (
        <div>
          {items().map((item) => (
            <span key={item.key} data-label={item.label}>
              {item.label}
            </span>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const numberNode = container.querySelector('[data-label="number"]');
    const stringNode = container.querySelector('[data-label="string"]');

    items!.set([...initial].reverse());
    flushScheduler();

    expect(container.querySelector('[data-label="number"]')).toBe(numberNode);
    expect(container.querySelector('[data-label="string"]')).toBe(stringNode);
    expect(container.firstElementChild?.firstElementChild?.textContent).toBe(
      'item-63'
    );
    cleanup();
  });

  it('should allow a keyed For to reorder numeric and string keys together', () => {
    const { container, cleanup } = createTestContainer();
    let items: ReturnType<typeof state<Array<string | number>>>;

    const Component = () => {
      items = state<Array<string | number>>([1, '1']);
      return (
        <div>
          <For each={items} by={(item) => item}>
            {(item) => (
              <span data-label={`${typeof item}:${String(item)}`}>
                {String(item)}
              </span>
            )}
          </For>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    expect(container.textContent).toBe('11');

    expect(() => {
      items!.set(['1', 1]);
      flushScheduler();
    }).not.toThrow();
    expect(
      container.firstElementChild?.firstElementChild?.getAttribute('data-label')
    ).toBe('string:1');
    cleanup();
  });

  it('should reject duplicate sibling keys on mount and update', () => {
    const { container, cleanup } = createTestContainer();

    let items: ReturnType<typeof state<Array<{ key: string; label: string }>>>;

    const Component = () => {
      items = state([
        { key: 'a', label: 'A1' },
        { key: 'b', label: 'B' },
      ]);

      return (
        <div>
          {items().map((it, i) => (
            <div key={it.key} data-key={it.key} data-pos={String(i)}>
              {it.label}
            </div>
          ))}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();
    const before = Array.from(container.querySelectorAll('[data-key]'));

    items!.set([
      { key: 'a', label: 'A1' },
      { key: 'a', label: 'A2' },
      { key: 'b', label: 'B' },
    ]);
    expect(() => flushScheduler()).toThrow(/Duplicate key a/);
    expect(Array.from(container.querySelectorAll('[data-key]'))).toEqual(
      before
    );

    const DuplicateOnMount = () => (
      <div>{[<span key="a">A1</span>, <span key="a">A2</span>]}</div>
    );
    const other = createTestContainer();
    expect(() =>
      createIsland({ root: other.container, component: DuplicateOnMount })
    ).toThrow(/Duplicate key a/);
    other.cleanup();

    cleanup();
  });

  it('should preserve keyed identity and positional identity for mixed keyed/unkeyed siblings', async () => {
    const { container, cleanup } = createTestContainer();

    // Represent the three children explicitly so we can toggle/reorder them
    let mode: ReturnType<
      typeof state<Array<{ type: 'k' | 'u'; key?: string; label: string }>>
    > | null = null;

    const Component = () => {
      mode = state([
        { type: 'k', key: 'a', label: 'KA' },
        { type: 'u', label: 'U' },
        { type: 'k', key: 'b', label: 'KB' },
      ]);

      return (
        <div>
          {mode().map((it) => {
            if (it.type === 'k') {
              return (
                <span key={it.key} data-key={it.key} data-label={it.label}>
                  {it.label}
                </span>
              );
            }
            return (
              <span data-unkey={'middle'} data-label={it.label}>
                {it.label}
              </span>
            );
          })}
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const keyA_before = container.querySelector('[data-key="a"]');
    const unkey_before = container.querySelector('[data-unkey="middle"]');
    const keyB_before = container.querySelector('[data-key="b"]');

    expect(keyA_before).toBeTruthy();
    expect(unkey_before).toBeTruthy();
    expect(keyB_before).toBeTruthy();

    // 1) Swap keyed 'a' and the unkeyed element
    mode!.set([
      { type: 'u', label: 'U' },
      { type: 'k', key: 'a', label: 'KA' },
      { type: 'k', key: 'b', label: 'KB' },
    ]);
    flushScheduler();

    const keyA_afterSwap = container.querySelector('[data-key="a"]');
    const unkey_afterSwap = container.querySelector('[data-unkey="middle"]');
    const keyB_afterSwap = container.querySelector('[data-key="b"]');

    // Keyed nodes keep identity by key
    expect(keyA_afterSwap).toBe(keyA_before);
    expect(keyB_afterSwap).toBe(keyB_before);

    // Unkeyed node preserves its identity positionally relative to other unkeyed nodes
    // (here it's the same single unkeyed node, so we expect the same element)
    expect(unkey_afterSwap).toBe(unkey_before);

    // 2) Insert a new keyed node at the front; this should not steal the unkeyed node
    mode!.set([
      { type: 'k', key: 'c', label: 'KC' },
      { type: 'u', label: 'U' },
      { type: 'k', key: 'a', label: 'KA' },
      { type: 'k', key: 'b', label: 'KB' },
    ]);
    flushScheduler();

    const unkey_afterInsert = container.querySelector('[data-unkey="middle"]');
    // Unkeyed element should still be the same DOM node (positional among unkeyed nodes)
    expect(unkey_afterInsert).toBe(unkey_before);

    // Keyed identity remains strict by key
    expect(container.querySelector('[data-key="a"]')).toBe(keyA_before);
    expect(container.querySelector('[data-key="b"]')).toBe(keyB_before);

    cleanup();
  });

  it('should update fragment primitive text positions without merging siblings', () => {
    const { container, cleanup } = createTestContainer();
    let setParts: (next: [string, string]) => void = () => {};

    const Component = () => {
      const parts = state<[string, string]>(['alpha', 'omega']);
      setParts = (next) => parts.set(next);

      return (
        <p id={'fragment-primitives'}>
          <>{parts()[0]}</>
          <span data-anchor={'middle'}>{'|'}</span>
          <>{parts()[1]}</>
        </p>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const host = container.querySelector('#fragment-primitives') as HTMLElement;
    const firstText = host.childNodes[0];
    const anchor = host.childNodes[1];
    const secondText = host.childNodes[2];

    expect(firstText.nodeType).toBe(Node.TEXT_NODE);
    expect(anchor).toBe(container.querySelector('[data-anchor="middle"]'));
    expect(secondText.nodeType).toBe(Node.TEXT_NODE);
    expect(firstText.textContent).toBe('alpha');
    expect(secondText.textContent).toBe('omega');

    setParts(['left', 'right']);
    flushScheduler();

    expect(host.childNodes.length).toBe(3);
    expect(host.childNodes[0]).toBe(firstText);
    expect(host.childNodes[1]).toBe(anchor);
    expect(host.childNodes[2]).toBe(secondText);
    expect(firstText.textContent).toBe('left');
    expect(secondText.textContent).toBe('right');

    cleanup();
  });

  it('should clean host refs and direct listeners when a nested component root host is replaced', () => {
    const { container, cleanup } = createTestContainer();
    let setKind: (next: 'button' | 'link') => void = () => {};
    let oldClicks = 0;
    let newClicks = 0;
    let refDetaches = 0;
    const refAttaches: Element[] = [];

    const hostRef = (element: Element | null) => {
      if (element) {
        refAttaches.push(element);
      } else {
        refDetaches += 1;
      }
    };

    const Child = ({ kind }: { kind: 'button' | 'link' }) =>
      kind === 'button' ? (
        <button
          id={'nested-host'}
          ref={hostRef}
          onClick={() => {
            oldClicks += 1;
          }}
        >
          {'old'}
        </button>
      ) : (
        <a
          id={'nested-host'}
          ref={hostRef}
          onClick={() => {
            newClicks += 1;
          }}
        >
          {'new'}
        </a>
      );

    const Component = () => {
      const kind = state<'button' | 'link'>('button');
      setKind = (next) => kind.set(next);

      return (
        <section>
          <Child kind={kind()} />
        </section>
      );
    };

    try {
      createIsland({ root: container, component: Component });
      flushScheduler();

      const oldHost = container.querySelector(
        '#nested-host'
      ) as HTMLButtonElement;
      oldHost.click();
      flushScheduler();
      expect(oldClicks).toBe(1);

      setKind('link');
      flushScheduler();

      const newHost = container.querySelector(
        '#nested-host'
      ) as HTMLAnchorElement;
      expect(newHost).not.toBe(oldHost);
      expect(newHost.tagName).toBe('A');
      expect(refAttaches).toEqual([oldHost, newHost]);
      expect(refDetaches).toBe(1);

      oldHost.click();
      flushScheduler();
      expect(oldClicks).toBe(1);

      newHost.click();
      flushScheduler();
      expect(newClicks).toBe(1);
    } finally {
      cleanup();
    }
  });
});
