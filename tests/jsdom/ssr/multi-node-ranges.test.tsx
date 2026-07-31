import { routeRegistryFromTable } from '../../router-test-utils';
import { describe, expect, it } from 'vite-plus/test';
import { hydrateSPA } from '../../../src/boot';
import { renderToStringSync } from '../../../src/ssr';
import { state } from '../../../src';
import { For, Show } from '@askrjs/askr/control';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('SSR anchored range markers', () => {
  it('should emit deterministic markers and hydrate multi-node control output', async () => {
    const { container, cleanup } = createTestContainer();
    const Component = () => (
      <main>
        <Show when={true}>
          <span id="range-a">A</span>
          <span id="range-b">B</span>
        </Show>
      </main>
    );

    try {
      const html = renderToStringSync(Component);
      expect(html).toContain('<!--askr-range-start-->');
      expect(html).toContain('<!--askr-range-end-->');

      container.innerHTML = html;
      const serverRangeA = container.querySelector('#range-a');
      await expect(
        hydrateSPA({
          root: container,
          registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
        })
      ).resolves.not.toThrow();

      expect(container.querySelector('#range-a')?.textContent).toBe('A');
      expect(container.querySelector('#range-b')?.textContent).toBe('B');
      expect(container.querySelector('#range-a')).toBe(serverRangeA);
    } finally {
      cleanup();
    }
  });
  it('should hydrate direct keyed Fragment ranges with listeners in place', async () => {
    const { container, cleanup } = createTestContainer();
    let setRows!: (rows: Array<{ id: number; label: string }>) => void;
    let clicked = '';

    const Component = () => {
      const rows = state([
        { id: 1, label: 'alpha' },
        { id: 2, label: 'beta' },
      ]);
      setRows = rows.set;
      return (
        <section>
          <For each={rows} by={(row) => row.id}>
            {(row) => (
              <>
                <button
                  data-direct-start={row.id}
                  onClick={() => {
                    clicked = row.label;
                  }}
                >
                  {row.label}
                </button>
                <span data-direct-end={row.id}>{`${row.label}:end`}</span>
              </>
            )}
          </For>
        </section>
      );
    };

    try {
      container.innerHTML = renderToStringSync(Component);
      const firstStart = container.querySelector('[data-direct-start="1"]');
      const firstEnd = container.querySelector('[data-direct-end="1"]');
      const secondStart = container.querySelector('[data-direct-start="2"]');
      const secondEnd = container.querySelector('[data-direct-end="2"]');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });

      expect(container.querySelector('[data-direct-start="1"]')).toBe(
        firstStart
      );
      expect(container.querySelector('[data-direct-end="1"]')).toBe(firstEnd);
      (firstStart as HTMLButtonElement).click();
      expect(clicked).toBe('alpha');

      setRows([
        { id: 2, label: 'beta' },
        { id: 1, label: 'alpha updated' },
      ]);
      flushScheduler();

      expect(
        Array.from(
          container.querySelector('section')!.children,
          (node) =>
            node.getAttribute('data-direct-start') ??
            node.getAttribute('data-direct-end')
        )
      ).toEqual(['2', '2', '1', '1']);
      expect(container.querySelector('[data-direct-start="1"]')).toBe(
        firstStart
      );
      expect(container.querySelector('[data-direct-end="1"]')).toBe(firstEnd);
      expect(container.querySelector('[data-direct-start="2"]')).toBe(
        secondStart
      );
      expect(container.querySelector('[data-direct-end="2"]')).toBe(secondEnd);
    } finally {
      cleanup();
    }
  });

  it('should hydrate a keyed component with a single Fragment child in place', async () => {
    const { container, cleanup } = createTestContainer();
    let clicks = 0;

    function Row() {
      return (
        <>
          <button
            data-single-fragment={'true'}
            onClick={() => {
              clicks += 1;
            }}
          >
            {'single'}
          </button>
        </>
      );
    }

    const Component = () => (
      <section>
        <For each={[1]} by={(id) => id}>
          {() => <Row />}
        </For>
      </section>
    );

    try {
      const html = renderToStringSync(Component);
      container.innerHTML = html;
      const serverButton = container.querySelector('[data-single-fragment]');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });

      const hydratedButton = container.querySelector(
        '[data-single-fragment]'
      ) as HTMLButtonElement;
      expect(hydratedButton).toBe(serverButton);
      hydratedButton.click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should hydrate an empty keyed component and expand its owned range', async () => {
    const { container, cleanup } = createTestContainer();
    let reveal!: () => void;
    let remove!: () => void;

    function Row() {
      const visible = state(false);
      reveal = () => visible.set(true);
      return visible() ? (
        <>
          <button data-empty-range-start={'true'}>{'ready'}</button>
          <span data-empty-range-end={'true'}>{'end'}</span>
        </>
      ) : null;
    }

    const Component = () => {
      const rows = state([1]);
      remove = () => rows.set([]);
      return (
        <section>
          <For each={rows} by={(id) => id}>
            {() => <Row />}
          </For>
          <strong data-empty-range-tail={'true'}>{'tail'}</strong>
        </section>
      );
    };

    try {
      const html = renderToStringSync(Component);
      expect(html).toContain('<!--askr-range-start-->');
      container.innerHTML = html;
      const tail = container.querySelector('[data-empty-range-tail]');

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });

      expect(
        container.querySelector('[data-empty-range-tail]'),
        container.innerHTML
      ).toBe(tail);
      expect(container.querySelector('[data-empty-range-start]')).toBeNull();

      reveal();
      flushScheduler();

      expect(
        container.querySelectorAll('[data-empty-range-start]')
      ).toHaveLength(1);
      expect(container.querySelectorAll('[data-empty-range-end]')).toHaveLength(
        1
      );
      expect(container.querySelector('[data-empty-range-tail]')).toBe(tail);
      expect(
        Array.from(
          container.querySelector('section')!.children,
          (node) =>
            node.getAttribute('data-empty-range-start') ??
            node.getAttribute('data-empty-range-end') ??
            node.getAttribute('data-empty-range-tail')
        )
      ).toEqual(['true', 'true', 'true']);

      remove();
      flushScheduler();
      expect(container.querySelector('[data-empty-range-start]')).toBeNull();
      expect(container.querySelector('[data-empty-range-end]')).toBeNull();
      expect(container.querySelector('[data-empty-range-tail]')).toBe(tail);
    } finally {
      cleanup();
    }
  });

  it('should hydrate adjacent nested transparent components within one keyed row', async () => {
    const { container, cleanup } = createTestContainer();
    const clicks: string[] = [];

    function Pair({ id }: { id: string }) {
      return (
        <>
          <button
            data-nested-range-start={id}
            onClick={() => {
              clicks.push(id);
            }}
          >
            {`${id}:start`}
          </button>
          <span data-nested-range-end={id}>{`${id}:end`}</span>
        </>
      );
    }

    function Row() {
      return (
        <>
          <Pair id={'first'} />
          <Pair id={'second'} />
        </>
      );
    }

    const Component = () => (
      <section>
        <For each={[1]} by={(id) => id}>
          {() => <Row />}
        </For>
      </section>
    );

    try {
      container.innerHTML = renderToStringSync(Component);
      const firstStart = container.querySelector(
        '[data-nested-range-start="first"]'
      );
      const firstEnd = container.querySelector(
        '[data-nested-range-end="first"]'
      );
      const secondStart = container.querySelector(
        '[data-nested-range-start="second"]'
      );
      const secondEnd = container.querySelector(
        '[data-nested-range-end="second"]'
      );

      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: Component }]),
      });

      expect(container.querySelector('[data-nested-range-start="first"]')).toBe(
        firstStart
      );
      expect(container.querySelector('[data-nested-range-end="first"]')).toBe(
        firstEnd
      );
      expect(
        container.querySelector('[data-nested-range-start="second"]')
      ).toBe(secondStart);
      expect(container.querySelector('[data-nested-range-end="second"]')).toBe(
        secondEnd
      );

      (firstStart as HTMLButtonElement).click();
      (secondStart as HTMLButtonElement).click();
      expect(clicks).toEqual(['first', 'second']);
    } finally {
      cleanup();
    }
  });
});
