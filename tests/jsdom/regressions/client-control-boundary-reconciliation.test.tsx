import { describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src';
import { For, Show } from '../../../src/control';
import { createQuery } from '../../../src/data';
import {
  DefaultPortal,
  definePortal,
  Portal,
  Presence,
} from '../../../src/foundations';
import { resource } from '../../../src/resources';
import { getCurrentComponentInstance } from '../../../src/runtime/component';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('client control-boundary reconciliation', () => {
  it('should remove raw empty siblings before a newly populated keyed For', () => {
    const { container, cleanup } = createTestContainer();
    let openWorkspace!: () => void;

    const Workspace = ({ id }: { id: string }) => (
      <>
        <output data-workspace-status={id}>{'Ready'}</output>
        <section data-workspace={id}>
          <input aria-label={`SQL ${id}`} />
        </section>
      </>
    );

    const App = () => {
      const rows = state<Array<{ id: string }>>([]);
      openWorkspace = () => rows.set([{ id: 'one' }]);
      return (
        <main>
          {null}
          {rows().length === 0 ? (
            <section data-empty-workspace={'true'}>{'New Query'}</section>
          ) : undefined}
          {false}
          <For each={() => rows()} by={(row) => row.id}>
            {(row) => <Workspace id={row.id} />}
          </For>
          {undefined}
          <footer data-workspace-tail={'true'}>{'tail'}</footer>
          {null}
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelector('[data-empty-workspace]')).not.toBeNull();
      const tail = container.querySelector('[data-workspace-tail]');

      openWorkspace();
      flushScheduler();

      expect(container.querySelector('[data-empty-workspace]')).toBeNull();
      expect(container.querySelectorAll('[data-workspace]')).toHaveLength(1);
      expect(
        container.querySelectorAll('input[aria-label="SQL one"]')
      ).toHaveLength(1);
      expect(container.querySelector('[data-workspace-tail]')).toBe(tail);
      expect(
        Array.from(
          container.querySelector('main')!.children,
          (child) => child.tagName
        )
      ).toEqual(['OUTPUT', 'SECTION', 'FOOTER']);
    } finally {
      cleanup();
    }
  });

  it('should retain the cursor after an empty accessor For in a mixed parent', () => {
    const { container, cleanup } = createTestContainer();
    let updateLabel!: (label: string) => void;

    const App = () => {
      const rows = state<Array<{ id: string }>>([]);
      const label = state('one');
      updateLabel = label.set;
      return (
        <main>
          <For each={() => rows()} by={(row) => row.id}>
            {(row) => <p data-row={row.id}>{row.id}</p>}
          </For>
          <div data-first-sibling={'true'}>{label()}</div>
          <footer data-tail-sibling={'true'}>{'tail'}</footer>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const firstSibling = container.querySelector('[data-first-sibling]');
      const tailSibling = container.querySelector('[data-tail-sibling]');

      updateLabel('updated');
      flushScheduler();

      expect(container.querySelectorAll('[data-first-sibling]')).toHaveLength(
        1
      );
      expect(container.querySelectorAll('[data-tail-sibling]')).toHaveLength(1);
      expect(container.querySelector('[data-first-sibling]')).toBe(
        firstSibling
      );
      expect(container.querySelector('[data-tail-sibling]')).toBe(tailSibling);
      expect(firstSibling?.textContent).toBe('updated');
    } finally {
      cleanup();
    }
  });

  it('should reconcile the Cassie mixed workspace boundary from its post-boundary cursor', async () => {
    const { container, cleanup } = createTestContainer();
    let setTabs!: (tabs: Array<{ id: string }>) => void;
    let setActive!: (id: string | null) => void;
    let setDialogOpen!: (open: boolean) => void;
    let setResult!: (value: string) => void;
    let refreshSchema!: () => Promise<void>;
    let mounts = 0;
    let cleanups = 0;
    const firstTab = { id: 'one' };
    const SidebarPortal = definePortal();
    const SidebarPortalContent = ({ children }: { children: unknown }) =>
      SidebarPortal.render({ children });
    const SidebarPortalHost = () => SidebarPortal();
    const QuerySidebar = ({
      queries,
    }: {
      queries: () => Array<{ id: string }>;
    }) => (
      <nav>
        <button aria-label={'New query'}>{'New query'}</button>
        <For each={() => queries()} by={(query) => query.id}>
          {(query) => <button data-sidebar-query={query.id}>{query.id}</button>}
        </For>
      </nav>
    );

    const WorkspaceSidebar = ({
      id,
      queries,
    }: {
      id: string;
      queries: () => Array<{ id: string }>;
    }) => (
      <SidebarPortalContent>
        <div data-active-query={id}>
          <QuerySidebar queries={queries} />
        </div>
      </SidebarPortalContent>
    );

    const QueryToast = ({ id }: { id: string }) => (
      <output data-query-toast={id}>{''}</output>
    );

    const QueryWorkspace = ({ id }: { id: string }) => {
      const draft = state('');
      const result = state('');
      const schema = createQuery({
        key: `cassie-schema:${id}`,
        fetch: async () => ({ label: `schema:${id}` }),
      });
      setResult = result.set;
      refreshSchema = () => schema.refresh();
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected query workspace instance');
      if (!instance.mounted) {
        mounts += 1;
        (instance.cleanupFns ??= []).push(() => {
          cleanups += 1;
        });
      }
      return (
        <>
          <WorkspaceSidebar id={id} queries={() => [{ id }]} />
          <QueryToast id={id} />
          <section data-query-workspace={id}>
            <p data-query-schema={id}>
              {schema.loading ? 'loading' : schema.data?.label}
            </p>
            <p data-query-result={id}>{result()}</p>
            <input
              aria-label={`SQL ${id}`}
              value={draft()}
              onInput={(event: Event) => {
                draft.set((event.target as HTMLInputElement).value);
              }}
            />
          </section>
        </>
      );
    };

    const EmptyTabsPortal = ({
      queries,
    }: {
      queries: () => Array<{ id: string }>;
    }) => (
      <SidebarPortalContent>
        <div data-empty-query-tab={'true'}>
          <QuerySidebar queries={queries} />
        </div>
      </SidebarPortalContent>
    );
    const Button = ({ children }: { children: unknown }) => (
      <button type={'button'}>{children}</button>
    );

    const App = () => {
      const tabs = state<Array<{ id: string }>>([]);
      const active = state<string | null>(null);
      const dialogOpen = state(false);
      const persistenceOperation = state('');
      const databases = createQuery({
        key: 'cassie-boundary-databases',
        fetch: async () => [{ name: 'cassie' }],
      });
      setTabs = tabs.set;
      setActive = active.set;
      setDialogOpen = dialogOpen.set;
      return (
        <>
          <aside data-query-tabs={'true'}>
            <SidebarPortalHost />
          </aside>
          <main data-persistence-operation={persistenceOperation()}>
            {tabs().length < 0 ? (
              <p data-persistence-error={'true'}>{'error'}</p>
            ) : null}
            {tabs().length === 0 ? <EmptyTabsPortal queries={tabs} /> : null}
            {tabs().length === 0 ? (
              <section data-new-query={'true'}>
                <h1>{'New Query'}</h1>
                <p>{'Create a query to begin.'}</p>
                <Button>{'New Query'}</Button>
              </section>
            ) : null}
            <For
              each={() => tabs().filter((tab) => tab.id === active())}
              by={(tab) => tab.id}
            >
              {(tab) => <QueryWorkspace id={tab.id} />}
            </For>
            <Show when={() => dialogOpen()}>
              <div data-dialog={'true'}>
                <For
                  each={() => databases.data ?? []}
                  by={(database) => database.name}
                >
                  {(database) => (
                    <button data-database={database.name}>
                      {database.name}
                    </button>
                  )}
                </For>
              </div>
            </Show>
            {tabs().length < 0 ? (
              <p data-create-database={'true'}>{'Create database'}</p>
            ) : null}
            {tabs().length < 0 ? (
              <p data-close-query={'true'}>{'Close query'}</p>
            ) : null}
          </main>
        </>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await Promise.resolve();
      flushScheduler();
      expect(container.querySelector('[data-new-query]')).not.toBeNull();

      setDialogOpen(true);
      flushScheduler();
      expect(container.querySelector('[data-dialog]')).not.toBeNull();
      expect(container.querySelector('[data-database]')?.textContent).toBe(
        'cassie'
      );

      setTabs([firstTab]);
      setActive('one');
      setDialogOpen(false);
      flushScheduler();

      expect(container.querySelector('[data-dialog]')).toBeNull();
      expect(container.querySelector('[data-new-query]')).toBeNull();
      expect(container.querySelectorAll('[data-query-workspace]')).toHaveLength(
        1
      );
      expect(container.querySelector('[data-active-query]')?.textContent).toBe(
        'New queryone'
      );
      expect(mounts).toBe(1);
      expect(cleanups).toBe(0);

      const workspace = container.querySelector('[data-query-workspace="one"]');
      const editor = container.querySelector(
        'input[aria-label="SQL one"]'
      ) as HTMLInputElement;
      await Promise.resolve();
      flushScheduler();
      expect(container.querySelector('[data-query-workspace="one"]')).toBe(
        workspace
      );
      expect(container.querySelector('input[aria-label="SQL one"]')).toBe(
        editor
      );
      editor.value = 'select 1';
      editor.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();
      expect(container.querySelector('[data-query-workspace="one"]')).toBe(
        workspace
      );
      expect(container.querySelector('input[aria-label="SQL one"]')).toBe(
        editor
      );
      expect(
        (
          container.querySelector(
            'input[aria-label="SQL one"]'
          ) as HTMLInputElement
        ).value
      ).toBe('select 1');
      expect(mounts).toBe(1);
      expect(cleanups).toBe(0);

      setTabs([firstTab]);
      flushScheduler();
      expect(container.querySelector('[data-new-query]')).toBeNull();
      expect(container.querySelector('[data-query-workspace="one"]')).toBe(
        workspace
      );

      setResult('1 row');
      flushScheduler();
      expect(container.querySelectorAll('[data-query-workspace]')).toHaveLength(
        1
      );
      expect(container.querySelector('[data-query-result]')?.textContent).toBe(
        '1 row'
      );

      await refreshSchema();
      flushScheduler();
      expect(container.querySelectorAll('[data-query-workspace]')).toHaveLength(
        1
      );
      expect(container.querySelector('[data-query-schema]')?.textContent).toBe(
        'schema:one'
      );

      setTabs([firstTab, { id: 'two' }]);
      setActive('two');
      flushScheduler();
      expect(container.querySelectorAll('[data-query-workspace]')).toHaveLength(
        1
      );
      expect(
        container.querySelector('[data-query-workspace="two"]')
      ).not.toBeNull();
      expect(container.querySelector('[data-active-query]')?.textContent).toBe(
        'New querytwo'
      );
      expect(mounts).toBe(2);
      expect(cleanups).toBe(1);
    } finally {
      cleanup();
    }
    expect(cleanups).toBe(mounts);
  });

  it('should preserve a keyed Cassie workspace while its parent resource resolves', async () => {
    const { container, cleanup } = createTestContainer();
    let resolveDatabases!: (databases: Array<{ name: string }>) => void;
    let setResult!: (value: string) => void;

    const QueryToast = ({ value }: { value: string }) => (
      <div data-query-toast={'true'} hidden={value === ''}>
        {value}
      </div>
    );

    const QueryEditor = ({
      query,
      onQueryChange,
    }: {
      query: string;
      onQueryChange: (sql: string) => void;
    }) => {
      const unavailable = state(false);
      unavailable();
      return (
        <div data-query-editor={'true'}>
          <input
            aria-label={'SQL one'}
            value={query}
            onInput={(event: Event) =>
              onQueryChange((event.target as HTMLInputElement).value)
            }
          />
        </div>
      );
    };

    const QueryWorkspace = ({
      tab,
      active,
      availability,
      onSqlChange,
    }: {
      tab: { id: string; database: string; sql: string };
      active: boolean;
      availability: () => string;
      onSqlChange: (sql: string) => void;
    }) => {
      const result = state('');
      setResult = result.set;
      return (
        <>
          {active ? (
            <Portal>
              <span data-sidebar-workspace={'true'}>{'Query 1'}</span>
            </Portal>
          ) : null}
          <QueryToast value={result()} />
          <section data-query-workspace={'one'} hidden={!active}>
            <div>
              <p data-availability={'true'}>{availability()}</p>
              <p data-result={'true'}>{result()}</p>
              <QueryEditor query={tab.sql} onQueryChange={onSqlChange} />
            </div>
          </section>
        </>
      );
    };

    const App = () => {
      const tabs = state([{ id: 'one', database: 'missing', sql: 'SELECT 1' }]);
      const active = state<string | null>('one');
      const persistenceOperation = state('');
      const databases = createQuery({
        key: 'cassie-parent-databases',
        fetch: () =>
          new Promise<Array<{ name: string }>>((resolve) => {
            resolveDatabases = resolve;
          }),
      });
      const availability = (database: string) => () =>
        databases.loading && !databases.data
          ? 'checking'
          : (databases.data ?? []).some(
                (candidate) => candidate.name === database
              )
            ? 'available'
            : 'unavailable';

      return (
        <>
          <aside>
            <DefaultPortal />
          </aside>
          <main data-persistence-operation={persistenceOperation()}>
            {tabs().length < 0 ? <p>{'persistence error'}</p> : null}
            {tabs().length === 0 ? <p>{'empty sidebar'}</p> : null}
            {tabs().length === 0 ? <section>{'New Query'}</section> : null}
            <For
              each={() => tabs().filter((tab) => tab.id === active())}
              by={(tab) => tab.id}
            >
              {(tab) => (
                <QueryWorkspace
                  tab={tab}
                  active={active() === tab.id}
                  availability={availability(tab.database)}
                  onSqlChange={(sql) => (
                    tabs.set(
                      tabs().map((candidate) => {
                        if (candidate.id === tab.id) {
                          Object.assign(candidate, { sql });
                        }
                        return candidate;
                      })
                    ),
                    active.set(active()),
                    persistenceOperation.set('updated')
                  )}
                />
              )}
            </For>
            <Show when={() => tabs().length < 0}>
              <p>{'dialog'}</p>
            </Show>
            {tabs().length < 0 ? <p>{'create database'}</p> : null}
            {tabs().length < 0 ? <p>{'close query'}</p> : null}
          </main>
        </>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const workspace = container.querySelector('[data-query-workspace]');
      const editor = container.querySelector('input[aria-label="SQL one"]');
      expect(container.querySelector('[data-availability]')?.textContent).toBe(
        'checking'
      );

      resolveDatabases([{ name: 'postgres' }]);
      await Promise.resolve();
      flushScheduler();

      expect(container.querySelector('[data-query-workspace]')).toBe(workspace);
      expect(container.querySelector('input[aria-label="SQL one"]')).toBe(
        editor
      );
      expect(container.querySelector('[data-availability]')?.textContent).toBe(
        'unavailable'
      );

      (editor as HTMLInputElement).value = 'SELECT 2';
      editor?.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();
      expect(container.querySelector('input[aria-label="SQL one"]')).toBe(
        editor
      );

      setResult('1 row');
      flushScheduler();
      expect(container.querySelector('[data-result]')?.textContent).toBe(
        '1 row'
      );
    } finally {
      cleanup();
    }
  });

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
