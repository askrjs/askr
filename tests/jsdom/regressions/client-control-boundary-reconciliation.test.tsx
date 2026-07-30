import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { For, Show } from '../../../src/control';
import { createQuery } from '../../../src/data';
import { Presence } from '../../../src/foundations';
import { resource } from '../../../src/resources';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('client control-boundary reconciliation', () => {
  it('should insert a newly opened branch before its sibling given adjacent same-tag Show boundaries', () => {
    let setFirst!: (value: boolean) => void;
    let setSecond!: (value: boolean) => void;
    const App = () => {
      const first = state(false);
      const second = state(true);
      setFirst = first.set;
      setSecond = second.set;
      return (
        <main>
          <Show when={first()}>
            <p data-first="true">first</p>
          </Show>
          <Show when={second()}>
            <p data-second="true">second</p>
          </Show>
        </main>
      );
    };
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const second = container.querySelector('[data-second]')!;
      setFirst(true);
      flushScheduler();
      expect(container.querySelector('[data-first]')).not.toBeNull();
      expect(container.querySelector('[data-second]')).toBe(second);
      setSecond(false);
      flushScheduler();
      expect(container.querySelector('[data-first]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });
  it('should mount an each-accessor workspace with a resource after empty boundaries', async () => {
    const { container, cleanup } = createTestContainer();
    let setRows!: (rows: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;

    const QueryWorkspace = ({ id }: { id: string }) => {
      const result = resource(() => `query:${id}`, [id]);
      return (
        <section data-query-workspace={id}>{result.value ?? 'loading'}</section>
      );
    };

    const App = () => {
      const rows = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      setRows = rows.set;
      setActive = active.set;

      return (
        <main>
          <Show when={rows().length === 0}>
            <p data-empty={'true'}>{'empty'}</p>
          </Show>
          <Show when={false}>
            <p data-secondary-empty={'true'}>{'secondary'}</p>
          </Show>
          <For
            each={() => rows().filter((row) => row.id === active())}
            by={(row) => row.id}
          >
            {(row) => <QueryWorkspace id={row.id} />}
          </For>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await Promise.resolve();
      flushScheduler();

      setRows([{ id: 'a' }]);
      setActive('a');
      flushScheduler();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelector('[data-empty]')).toBeNull();
      expect(container.querySelectorAll('[data-query-workspace]')).toHaveLength(
        1
      );
      expect(
        container.querySelector('[data-query-workspace="a"]')?.textContent
      ).toBe('query:a');
    } finally {
      cleanup();
    }
  });

  it('should mount a resource child when Show changes from false to true', async () => {
    const { container, cleanup } = createTestContainer();
    let setSelected!: (id: string | null) => void;

    const QueryResults = ({ id }: { id: string }) => {
      const result = resource(async () => `result:${id}`, [id]);
      return (
        <section data-query-results={id}>{result.value ?? 'loading'}</section>
      );
    };

    const App = () => {
      const selected = state<string | null>(null);
      setSelected = selected.set;
      return (
        <main>
          <Show when={selected() === null}>
            <p data-empty-results={'true'}>{'empty'}</p>
          </Show>
          <Show when={selected() !== null}>
            <QueryResults id={selected() as string} />
          </Show>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await Promise.resolve();
      flushScheduler();

      setSelected('orders');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelector('[data-empty-results]')).toBeNull();
      expect(container.querySelectorAll('[data-query-results]')).toHaveLength(
        1
      );
      expect(
        container.querySelector('[data-query-results="orders"]')?.textContent
      ).toBe('result:orders');
    } finally {
      cleanup();
    }
  });

  it('should mount a hook-using Show callback child after a query becomes truthy', async () => {
    const { container, cleanup } = createTestContainer();
    let setQuery!: (query: string | null) => void;

    const QueryResults = ({ query }: { query: string }) => {
      const result = resource(async () => `search:${query}`, [query]);
      return (
        <section data-search-results={query}>
          {result.value ?? 'loading'}
        </section>
      );
    };

    const App = () => {
      const query = state<string | null>(null);
      setQuery = query.set;
      return (
        <main>
          <Show when={query()}>
            {(value) => <QueryResults query={value} />}
          </Show>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await Promise.resolve();
      flushScheduler();

      setQuery('orders');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelectorAll('[data-search-results]')).toHaveLength(
        1
      );
      expect(
        container.querySelector('[data-search-results="orders"]')?.textContent
      ).toBe('search:orders');
    } finally {
      cleanup();
    }
  });

  it('should reconcile a createQuery workspace through empty and active updates', async () => {
    const { container, cleanup } = createTestContainer();
    let setTabs!: (tabs: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;

    const QueryWorkspace = ({ id }: { id: string }) => {
      const query = createQuery({
        key: `workspace:${id}`,
        fetch: async () => ({ id }),
      });
      return (
        <section data-query-cell={id}>{query.data?.id ?? 'loading'}</section>
      );
    };

    const App = () => {
      const tabs = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      setTabs = tabs.set;
      setActive = active.set;
      return (
        <main>
          <Show when={tabs().length === 0}>
            <p data-empty-tabs={'true'}>{'empty'}</p>
          </Show>
          <Show when={false}>
            <p data-secondary-tabs={'true'}>{'secondary'}</p>
          </Show>
          <For
            each={() => tabs().filter((tab) => tab.id === active())}
            by={(tab) => tab.id}
          >
            {(tab) => <QueryWorkspace id={tab.id} />}
          </For>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      setTabs([{ id: 'one' }]);
      setActive('one');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelector('[data-empty-tabs]')).toBeNull();
      expect(container.querySelectorAll('[data-query-cell]')).toHaveLength(1);
      expect(container.querySelector('[data-query-cell="one"]')).not.toBeNull();

      setTabs([{ id: 'one' }, { id: 'two' }]);
      setActive('two');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelectorAll('[data-query-cell]')).toHaveLength(1);
      expect(container.querySelector('[data-query-cell="two"]')).not.toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should remove the empty branch when an accessor For mounts a multi-node query workspace', async () => {
    const { container, cleanup } = createTestContainer();
    let setTabs!: (tabs: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;

    const QueryWorkspace = ({ id }: { id: string }) => {
      const query = createQuery({
        key: `fragment-workspace:${id}`,
        fetch: async () => ({ id }),
      });
      return (
        <>
          <aside data-query-sidebar={id}>{'sidebar'}</aside>
          <section data-fragment-query={id}>
            {query.data?.id ?? 'loading'}
          </section>
        </>
      );
    };

    const App = () => {
      const tabs = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      setTabs = tabs.set;
      setActive = active.set;
      return (
        <main>
          <Show when={tabs().length === 0}>
            <p data-fragment-empty={'true'}>{'empty'}</p>
          </Show>
          <Show when={false}>
            <p data-fragment-secondary={'true'}>{'secondary'}</p>
          </Show>
          <For
            each={() => tabs().filter((tab) => tab.id === active())}
            by={(tab) => tab.id}
          >
            {(tab) => <QueryWorkspace id={tab.id} />}
          </For>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      setTabs([{ id: 'one' }]);
      setActive('one');
      flushScheduler();
      await Promise.resolve();
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelector('[data-fragment-empty]')).toBeNull();
      expect(container.querySelectorAll('[data-fragment-query]')).toHaveLength(
        1
      );
      expect(container.querySelectorAll('[data-query-sidebar]')).toHaveLength(
        1
      );
    } finally {
      cleanup();
    }
  });

  it('should remove consecutive inactive boundaries before mounting one keyed workspace', () => {
    const { container, cleanup } = createTestContainer();
    let setRows!: (rows: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;
    let mounts = 0;
    let cleanups = 0;

    const Workspace = ({ id }: { id: string }) => {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected workspace instance');
      if (!instance.mounted) {
        mounts += 1;
        (instance.cleanupFns ??= []).push(() => {
          cleanups += 1;
        });
      }
      return <section data-workspace={id}>{`workspace-${id}`}</section>;
    };

    const App = () => {
      const rows = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      setRows = rows.set;
      setActive = active.set;

      return (
        <main>
          <Show when={rows().length === 0}>
            <p data-empty={'true'}>{'empty'}</p>
          </Show>
          <Show when={false}>
            <p data-secondary-empty={'true'}>{'secondary'}</p>
          </Show>
          <For
            each={rows().filter((row) => row.id === active())}
            by={(row) => row.id}
          >
            {(row) => <Workspace id={row.id} />}
          </For>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelectorAll('[data-empty]')).toHaveLength(1);

      setRows([{ id: 'a' }]);
      setActive('a');
      flushScheduler();

      const firstWorkspace = container.querySelector('[data-workspace="a"]');
      expect(firstWorkspace).not.toBeNull();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-empty]')).toBeNull();

      setRows([{ id: 'a' }, { id: 'b' }]);
      flushScheduler();
      expect(container.querySelector('[data-workspace="a"]')).toBe(
        firstWorkspace
      );

      setActive('b');
      flushScheduler();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-workspace="b"]')).not.toBeNull();
      expect(mounts).toBe(2);
      expect(cleanups).toBe(1);

      setRows([]);
      setActive(null);
      flushScheduler();
      setRows([{ id: 'a' }]);
      setActive('a');
      flushScheduler();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(container.querySelector('[data-empty]')).toBeNull();
      expect(mounts).toBe(3);
      expect(cleanups).toBe(2);
    } finally {
      cleanup();
    }
  });

  it('should remove a Presence fragment when a component closes and permit reopen', () => {
    const { container, cleanup } = createTestContainer();
    let setOpen!: (open: boolean) => void;
    let mounts = 0;
    let cleanups = 0;

    const Content = () => {
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected content instance');
      if (!instance.mounted) {
        mounts += 1;
        (instance.cleanupFns ??= []).push(() => {
          cleanups += 1;
        });
      }
      return <div data-presence-content={'true'}>{'content'}</div>;
    };

    const PresenceBranch = ({ open }: { open: boolean }) => (
      <Presence present={open}>
        <Content />
      </Presence>
    );

    const App = () => {
      const open = state(true);
      setOpen = open.set;
      return (
        <section>
          <PresenceBranch open={open()} />
          <span data-static={'true'}>{'static'}</span>
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(
        container.querySelectorAll('[data-presence-content]')
      ).toHaveLength(1);

      setOpen(false);
      flushScheduler();
      expect(container.querySelector('[data-presence-content]')).toBeNull();
      expect(container.querySelector('[data-static]')?.textContent).toBe(
        'static'
      );
      expect(cleanups).toBe(1);

      setOpen(true);
      flushScheduler();
      expect(
        container.querySelectorAll('[data-presence-content]')
      ).toHaveLength(1);
      expect(mounts).toBe(2);
      expect(cleanups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should not adopt identical-looking unowned DOM during a client mount', () => {
    const { container, cleanup } = createTestContainer();
    let setVisible!: (visible: boolean) => void;
    let clicks = 0;

    const OwnedButton = () => (
      <button
        type="button"
        data-client-owned={'true'}
        onClick={() => {
          clicks += 1;
        }}
      >
        {'ready'}
      </button>
    );

    const App = () => {
      const visible = state(false);
      setVisible = visible.set;
      return <main>{visible() ? <OwnedButton /> : null}</main>;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const main = container.querySelector('main')!;
      const stale = document.createElement('button');
      stale.type = 'button';
      stale.dataset.clientOwned = 'false';
      stale.textContent = 'ready';
      main.appendChild(stale);

      setVisible(true);
      flushScheduler();
      const current = main.querySelector('button') as HTMLButtonElement;
      expect(current).not.toBe(stale);
      expect(current.dataset.clientOwned).toBe('true');
      current.click();
      expect(clicks).toBe(1);
    } finally {
      cleanup();
    }
  });
});
