import { describe, expect, it } from 'vite-plus/test';
import { createSPA, cleanupApp, hydrateSPA } from '../../../src/boot';
import { Link } from '../../../src/components/link';
import { For } from '../../../src/control';
import { Slot } from '../../../src/foundations';
import { state } from '../../../src';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  resetRouteState,
  routeRegistryFromTable,
} from '../../router-test-utils';

describe('adjacent For boundary ownership', () => {
  const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');
  let rerender = () => {};

  const Container = (props: { children?: unknown; class?: string }) => (
    <div class={props.class}>{props.children}</div>
  );

  const Badge = (props: { children: JSX.Element }) => (
    <Slot asChild class="topic-button" children={props.children} />
  );

  const CalloutLink = (props: { id: string; label: string }) => (
    <Badge>
      <Link href={`/${props.id}`} data-link={props.id}>
        {props.label}
      </Link>
    </Badge>
  );

  const App = () => {
    const revision = state(0);
    rerender = () => revision.set(revision() + 1);

    const overviewSections = [
      { id: 'what', title: 'What', body: 'What body' },
      { id: 'fit', title: 'Fit', body: 'Fit body' },
    ];
    const workItems = [
      { id: 'a', title: 'A', body: 'A body' },
      { id: 'b', title: 'B', body: 'B body' },
    ];

    return (
      <div data-revision={revision()}>
        <For each={overviewSections} by={(section) => section.id}>
          {(section, index) => (
            <section data-row={section.id}>
              <Container
                class={`split-section${index() === 1 ? ' split-section-reverse' : ''}`}
              >
                <div>
                  <h2>{section.title}</h2>
                </div>
                <div class="prose-stack">
                  <p>{section.body}</p>
                  <CalloutLink id={section.id} label={section.title} />
                </div>
              </Container>
            </section>
          )}
        </For>
        <section class="editorial-evidence">
          <Container class="evidence-grid">
            <For each={workItems} by={(item) => item.id}>
              {(item) => (
                <article data-work={item.id}>
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              )}
            </For>
          </Container>
        </section>
      </div>
    );
  };

  function expectCorrectStructure(container: Element): void {
    expect(
      container.querySelector('[data-link="what"]')?.parentElement?.className
    ).toBe('prose-stack');
    expect(
      container.querySelector('[data-link="fit"]')?.parentElement?.className
    ).toBe('prose-stack');
    expect(
      container.querySelectorAll('.evidence-grid [data-link]').length
    ).toBe(0);
    expect(container.querySelectorAll('[data-row]').length).toBe(2);
    expect(container.querySelectorAll('[data-work]').length).toBe(2);
  }

  function flushRerender(): void {
    rerender();
    flushScheduler();
  }

  function cleanupExecutionModel(): void {
    delete (globalThis as unknown as Record<string | symbol, unknown>)[
      EXECUTION_MODEL_KEY
    ];
  }

  it('should keep the last item in its own section after a client rerender', async () => {
    const { container, cleanup } = createTestContainer();

    try {
      resetRouteState();
      createIsland({ root: container, component: App });
      flushScheduler();
      await Promise.resolve();
      flushRerender();
      expectCorrectStructure(container);
    } finally {
      cleanup();
      cleanupExecutionModel();
    }
  });

  it('should preserve adjacent For ranges after SSR hydration and rerender', async () => {
    const { container, cleanup } = createTestContainer();

    try {
      resetRouteState();
      container.innerHTML = renderToStringSync(App);
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });
      flushScheduler();
      await Promise.resolve();
      flushRerender();
      expectCorrectStructure(container);
    } finally {
      cleanup();
      cleanupExecutionModel();
    }
  });

  it('should preserve adjacent For ranges in a routed client app', async () => {
    const { container, cleanup } = createTestContainer();

    try {
      resetRouteState();
      window.history.replaceState({}, '', '/');
      await createSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });
      flushScheduler();
      await Promise.resolve();
      flushRerender();
      expectCorrectStructure(container);
    } finally {
      cleanupApp(container);
      cleanup();
      cleanupExecutionModel();
    }
  });

  it('should keep sibling content intact when a mixed For source changes', () => {
    const { container, cleanup } = createTestContainer();
    let setRows = (_rows: Array<{ id: string }>) => {};

    const MutableApp = () => {
      const rows = state([{ id: 'one' }, { id: 'two' }]);
      setRows = (next) => rows.set(next);

      return (
        <div>
          <span data-before>Before</span>
          <For
            each={rows}
            by={(row) => row.id}
            fallback={<p data-empty>No rows</p>}
          >
            {(row) => <section data-mutable-row={row.id}>{row.id}</section>}
          </For>
          <section data-after>
            <For each={[{ id: 'a' }, { id: 'b' }]} by={(item) => item.id}>
              {(item) => <article data-after-row={item.id}>{item.id}</article>}
            </For>
          </section>
        </div>
      );
    };

    try {
      resetRouteState();
      createIsland({ root: container, component: MutableApp });
      flushScheduler();

      setRows([{ id: 'two' }, { id: 'three' }]);
      flushScheduler();
      expect(
        Array.from(container.querySelectorAll('[data-mutable-row]')).map(
          (node) => node.getAttribute('data-mutable-row')
        )
      ).toEqual(['two', 'three']);
      expect(container.querySelectorAll('[data-after-row]')).toHaveLength(2);

      setRows([]);
      flushScheduler();
      expect(container.querySelector('[data-empty]')?.textContent).toBe(
        'No rows'
      );
      expect(container.querySelector('[data-before]')?.textContent).toBe(
        'Before'
      );
      expect(container.querySelectorAll('[data-after-row]')).toHaveLength(2);
    } finally {
      cleanup();
      cleanupExecutionModel();
    }
  });
});
