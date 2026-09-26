import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { state, type State } from '../../../src/runtime/reactivity/state';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  resetRouteState,
  routeRegistryFromTable,
} from '../../router-test-utils';

describe('For rows in a mixed parent', () => {
  const executionModelKey = Symbol.for('__ASKR_EXECUTION_MODEL__');
  const resetExecutionModel = () => {
    delete (globalThis as Record<string | symbol, unknown>)[executionModelKey];
  };
  beforeEach(resetExecutionModel);
  afterEach(resetExecutionModel);
  it('should commit a nested row rerun next to text without replacing siblings', () => {
    const { container, cleanup } = createTestContainer();
    let suffix!: State<string>;

    function App() {
      suffix = state('x');
      return (
        <ul>
          <For each={[{ id: 'a', label: 'label' }]} by={(item) => item.id}>
            {(outer) => (
              <li>
                {outer.label + ':'}
                <For each={[{ id: 'i' }]} by={(item) => item.id}>
                  {(item) => (
                    <b data-row={item.id}>{`${item.id}${suffix()}`}</b>
                  )}
                </For>
                <span data-after={'true'}>{'after'}</span>
              </li>
            )}
          </For>
        </ul>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const before = container.querySelector('[data-after]');
      const row = container.querySelector('[data-row]');
      expect(row?.textContent).toBe('ix');

      suffix.set('y');
      flushScheduler();
      expect(container.querySelector('[data-row]')?.textContent).toBe('iy');
      expect(container.querySelector('[data-after]')).toBe(before);
      expect(container.querySelector('[data-row]')).toBe(row);
    } finally {
      cleanup();
    }
  });

  it('should reorder and remove nested rows while preserving surrounding nodes', () => {
    const { container, cleanup } = createTestContainer();
    let items!: State<Array<{ id: string; label: string }>>;

    function App() {
      items = state([
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ]);
      return (
        <ul>
          <For each={[{ id: 'outer' }]} by={(item) => item.id}>
            {() => (
              <li>
                <i data-before={'true'}>{'before'}</i>
                <For each={items} by={(item) => item.id}>
                  {(item) => <b data-row={item.id}>{item.label}</b>}
                </For>
                <i data-after={'true'}>{'after'}</i>
              </li>
            )}
          </For>
        </ul>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const before = container.querySelector('[data-before]');
      const after = container.querySelector('[data-after]');
      const rowA = container.querySelector('[data-row="a"]');
      const rowB = container.querySelector('[data-row="b"]');

      items.set([
        { id: 'b', label: 'Bee' },
        { id: 'a', label: 'Aye' },
      ]);
      flushScheduler();
      expect(
        Array.from(
          container.querySelectorAll('[data-row]'),
          (node) => node.textContent
        )
      ).toEqual(['Bee', 'Aye']);
      expect(container.querySelector('[data-row="a"]')).toBe(rowA);
      expect(container.querySelector('[data-row="b"]')).toBe(rowB);
      expect(container.querySelector('[data-before]')).toBe(before);
      expect(container.querySelector('[data-after]')).toBe(after);

      items.set([{ id: 'a', label: 'Aye' }]);
      flushScheduler();
      expect(
        Array.from(container.querySelectorAll('[data-row]'), (node) =>
          node.getAttribute('data-row')
        )
      ).toEqual(['a']);
      expect(container.querySelector('[data-before]')).toBe(before);
      expect(container.querySelector('[data-after]')).toBe(after);
    } finally {
      cleanup();
    }
  });

  it('should keep the prior mixed commit callback after a failed removal', () => {
    const { container, cleanup } = createTestContainer();
    let suffix!: State<string>;
    let remove!: State<boolean>;

    function Failure(props: { active: boolean }) {
      if (props.active) throw new Error('removal failed');
      return null;
    }

    function App() {
      suffix = state('x');
      remove = state(false);
      return (
        <ul>
          <For each={[{ id: 'outer' }]} by={(item) => item.id}>
            {() => (
              <li>
                {'label:'}
                {remove() ? null : (
                  <For each={[{ id: 'i' }]} by={(item) => item.id}>
                    {(item) => (
                      <b data-row={item.id}>{`${item.id}${suffix()}`}</b>
                    )}
                  </For>
                )}
                <span data-after={'true'}>{'after'}</span>
                <Failure active={remove()} />
              </li>
            )}
          </For>
        </ul>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      remove.set(true);
      expect(() => flushScheduler()).toThrow('removal failed');
      expect(container.querySelector('[data-row]')?.textContent).toBe('ix');
      suffix.set('y');
      flushScheduler();
      expect(container.querySelector('[data-row]')?.textContent).toBe('iy');
    } finally {
      cleanup();
    }
  });

  it('should ignore a queued row commit after its mixed boundary is removed', () => {
    const { container, cleanup } = createTestContainer();
    let suffix!: State<string>;
    let shown!: State<boolean>;

    function App() {
      suffix = state('x');
      shown = state(true);
      return (
        <ul>
          <For each={[{ id: 'outer' }]} by={(item) => item.id}>
            {() => (
              <li>
                {'label:'}
                {shown() ? (
                  <For each={[{ id: 'i' }]} by={(item) => item.id}>
                    {(item) => (
                      <b data-row={item.id}>{`${item.id}${suffix()}`}</b>
                    )}
                  </For>
                ) : null}
                <span data-after={'true'}>{'after'}</span>
              </li>
            )}
          </For>
        </ul>
      );
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      suffix.set('y');
      shown.set(false);
      flushScheduler();
      expect(container.querySelector('[data-row]')).toBeNull();
      expect(container.querySelectorAll('[data-after]')).toHaveLength(1);
      suffix.set('z');
      flushScheduler();
      expect(container.querySelector('[data-row]')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should adopt a nested mixed row and update it after hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let suffix!: State<string>;

    function App() {
      suffix = state('x');
      return (
        <ul>
          <For each={[{ id: 'outer' }]} by={(item) => item.id}>
            {() => (
              <li>
                {'label:'}
                <For each={[{ id: 'i' }]} by={(item) => item.id}>
                  {(item) => (
                    <b data-row={item.id}>{`${item.id}${suffix()}`}</b>
                  )}
                </For>
                <span data-after={'true'}>{'after'}</span>
              </li>
            )}
          </For>
        </ul>
      );
    }

    try {
      resetRouteState();
      container.innerHTML = renderToStringSync(App);
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
        hydrate: { verifyMarkup: true },
      });
      flushScheduler();
      const row = container.querySelector('[data-row]');
      const after = container.querySelector('[data-after]');
      suffix.set('y');
      flushScheduler();
      expect(container.querySelector('[data-row]')).toBe(row);
      expect(row?.textContent).toBe('iy');
      expect(container.querySelector('[data-after]')).toBe(after);
    } finally {
      cleanup();
      resetRouteState();
    }
  });
});
