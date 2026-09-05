import { describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src';
import { For, Show } from '../../../src/control';
import { definePortal, Presence } from '../../../src/foundations';
import { getCurrentComponentInstance } from '../../../src/runtime';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

type InstanceHost = Node & {
  __ASKR_INSTANCE?: object;
  __ASKR_INSTANCES?: object[];
};

function expectSameOwners(host: InstanceHost, owners: object[]): void {
  const currentOwners = host.__ASKR_INSTANCES ?? [];
  expect(currentOwners).toHaveLength(owners.length);
  currentOwners.forEach((owner, index) => {
    expect(owner).toBe(owners[index]);
  });
}

function findOwnerHost(root: Node, owner: object): InstanceHost | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
  let current: Node | null = walker.currentNode;
  while (current) {
    const host = current as InstanceHost;
    if (
      host.__ASKR_INSTANCE === owner ||
      host.__ASKR_INSTANCES?.includes(owner)
    ) {
      return host;
    }
    current = walker.nextNode();
  }
  return null;
}

describe('controlled modal reconciliation', () => {
  it('should preserve controlled fields, portals, handlers, and ownership through mixed boundaries', () => {
    const { container, cleanup } = createTestContainer();
    const DialogPortalHost = definePortal();
    const SelectPortalHost = definePortal();
    const DialogScope = defineScope<{ open: boolean } | null>(null);
    const SelectScope = defineScope<{
      value: string;
      onValueChange: (value: string) => void;
      currentIndex: number;
      onCurrentIndexChange: (index: number) => void;
    } | null>(null);
    const SelectRenderScope = defineScope<object | null>(null);
    const databases = ['cassie', 'postgres'];
    const created: Array<{ database: string; name: string }> = [];
    let modalMounts = 0;
    let modalCleanups = 0;
    let modalOwner!: object;

    const DialogRoot = ({
      open,
      children,
    }: {
      open: boolean;
      children: unknown;
    }) => (
      <DialogScope value={{ open }}>
        {children}
        <DialogPortalHost key={'dialog-portal-host'} />
      </DialogScope>
    );

    const DialogPortal = ({ children }: { children: unknown }) =>
      DialogPortalHost.render({ children });

    const DialogOverlay = () => {
      const root = readScope(DialogScope);
      if (!root) throw new Error('expected dialog scope');
      return (
        <Presence present={root.open}>
          <div data-dialog-overlay={'true'} />
        </Presence>
      );
    };

    const FocusScope = ({ children }: { children: unknown }) => (
      <div data-focus-scope={'true'}>{children}</div>
    );

    const DismissableLayer = ({ children }: { children: unknown }) => (
      <div data-dismissable-layer={'true'}>{children}</div>
    );

    const DialogContent = ({ children }: { children: unknown }) => {
      const root = readScope(DialogScope);
      if (!root) throw new Error('expected dialog scope');
      return (
        <Presence present={root.open}>
          <FocusScope>
            <DismissableLayer>
              <section data-dialog-content={'true'}>{children}</section>
            </DismissableLayer>
          </FocusScope>
        </Presence>
      );
    };

    const SelectRoot = ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: unknown;
    }) => {
      const currentIndex = state(0);
      SelectPortalHost.render({ children: null });
      return (
        <SelectScope
          value={{
            value,
            onValueChange,
            currentIndex: currentIndex(),
            onCurrentIndexChange: currentIndex.set,
          }}
        >
          <>
            {children}
            <SelectPortalHost key={'select-portal-host'} />
          </>
        </SelectScope>
      );
    };

    const SelectValue = () => {
      const root = readScope(SelectScope);
      if (!root) throw new Error('expected select scope');
      return (
        <span data-select-value={'true'}>
          {root.value || 'Select a database'}
        </span>
      );
    };

    const SelectPortal = ({ children }: { children: unknown }) =>
      SelectPortalHost.render({ children });

    const SelectContent = ({ children }: { children: unknown }) => {
      const root = readScope(SelectScope);
      if (!root) throw new Error('expected select scope');
      return (
        <Presence present={true}>
          <FocusScope>
            <DismissableLayer>
              <SelectScope value={root}>
                <SelectRenderScope value={{}}>
                  <div data-select-content={'true'}>{children}</div>
                </SelectRenderScope>
              </SelectScope>
            </DismissableLayer>
          </FocusScope>
        </Presence>
      );
    };

    const SelectItem = ({
      value,
      children,
    }: {
      value: string;
      children: unknown;
    }) => {
      const root = readScope(SelectScope);
      if (!root) throw new Error('expected select scope');
      return (
        <button
          type={'button'}
          data-select-item={value}
          data-current={root.currentIndex}
          onClick={() => {
            root.onValueChange(value);
            root.onCurrentIndexChange(value === 'postgres' ? 1 : 0);
          }}
        >
          {children}
        </button>
      );
    };

    const NewQueryDialog = () => {
      const name = state('');
      const database = state('');
      const loading = false;
      const error: string | null = null;
      const instance = getCurrentComponentInstance();
      if (!instance) throw new Error('expected modal component instance');
      modalOwner = instance;
      if (!instance.ownership.mounted) {
        modalMounts += 1;
        (instance.ownership.cleanups ??= []).push(() => {
          modalCleanups += 1;
        });
      }

      return (
        <DialogRoot open={true}>
          <DialogPortal>
            <>
              <DialogOverlay />
              <DialogContent>
                <h1>{'New Query'}</h1>
                {loading ? <p>{'loading'}</p> : null}
                <label>
                  {'Query name'}
                  <input
                    aria-label={'Query name'}
                    value={name()}
                    onInput={(event: Event) =>
                      name.set((event.currentTarget as HTMLInputElement).value)
                    }
                  />
                </label>
                <SelectRoot value={database()} onValueChange={database.set}>
                  <button
                    type={'button'}
                    data-select-trigger={'true'}
                    aria-label={'Database'}
                  >
                    <SelectValue />
                  </button>
                  <SelectPortal>
                    <SelectContent>
                      <For
                        each={() => databases}
                        by={(databaseName) => databaseName}
                      >
                        {(databaseName) => (
                          <SelectItem value={databaseName}>
                            {databaseName}
                          </SelectItem>
                        )}
                      </For>
                    </SelectContent>
                  </SelectPortal>
                </SelectRoot>
                {error ? <p>{error}</p> : null}
                <button
                  type={'button'}
                  data-create={'true'}
                  disabled={!database()}
                  onClick={() =>
                    created.push({
                      database: database(),
                      name: name(),
                    })
                  }
                >
                  {'Create'}
                </button>
              </DialogContent>
            </>
          </DialogPortal>
        </DialogRoot>
      );
    };

    const App = () => {
      const tabs = state<Array<{ id: string }>>([]);
      const dialogOpen = state(true);
      return (
        <main>
          {tabs().length === 0 ? (
            <section data-empty={'true'}>{'No queries'}</section>
          ) : null}
          <For each={() => tabs()} by={(tab) => tab.id}>
            {(tab) => <article data-tab={tab.id}>{tab.id}</article>}
          </For>
          <Show when={dialogOpen()}>
            <NewQueryDialog />
          </Show>
          {tabs().length < 0 ? <p>{'Create database'}</p> : null}
          {tabs().length < 0 ? <p>{'Close query'}</p> : null}
          <footer data-tail={'true'}>{'tail'}</footer>
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      flushScheduler();

      const dialog = container.querySelector('[data-dialog-content]');
      const overlay = container.querySelector('[data-dialog-overlay]');
      const overlayWrapper = overlay?.parentElement;
      const input = container.querySelector(
        'input[aria-label="Query name"]'
      ) as HTMLInputElement;
      const selectTrigger = container.querySelector(
        '[data-select-trigger]'
      ) as HTMLButtonElement;
      const selectValue = container.querySelector('[data-select-value]');
      const selectContent = container.querySelector('[data-select-content]');
      const postgresItem = container.querySelector(
        '[data-select-item="postgres"]'
      ) as HTMLButtonElement;
      const create = container.querySelector(
        '[data-create]'
      ) as HTMLButtonElement;
      const tail = container.querySelector('[data-tail]');
      const ownershipHost = findOwnerHost(container, modalOwner);
      const owners = [...(ownershipHost?.__ASKR_INSTANCES ?? [])];

      expect(dialog).toBeTruthy();
      expect(input).toBeTruthy();
      expect(selectTrigger).toBeTruthy();
      expect(postgresItem).toBeTruthy();
      expect(create.disabled).toBe(true);
      expect(ownershipHost).toBeTruthy();
      expect(owners.length).toBeGreaterThan(0);
      expect(modalMounts).toBe(1);
      expect(modalCleanups).toBe(0);

      input.focus();
      const edits = [
        { value: 'ac', start: 1, end: 1, direction: 'none' as const },
        { value: 'Ada', start: 1, end: 3, direction: 'backward' as const },
        {
          value: 'Ada Lovelace',
          start: 4,
          end: 4,
          direction: 'none' as const,
        },
      ];

      for (const edit of edits) {
        input.value = edit.value;
        input.setSelectionRange(edit.start, edit.end, edit.direction);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        flushScheduler();

        expect(container.querySelector('input[aria-label="Query name"]')).toBe(
          input
        );
        expect(container.querySelector('[data-dialog-content]')).toBe(dialog);
        expect(
          container.querySelector('[data-dialog-overlay]')?.parentElement
        ).toBe(overlayWrapper);
        expect(container.querySelector('[data-dialog-overlay]')).toBe(overlay);
        expect(container.querySelector('[data-select-trigger]')).toBe(
          selectTrigger
        );
        expect(container.querySelector('[data-select-value]')).toBe(
          selectValue
        );
        expect(container.querySelector('[data-select-content]')).toBe(
          selectContent
        );
        expect(container.querySelector('[data-select-item="postgres"]')).toBe(
          postgresItem
        );
        expect(container.querySelector('[data-create]')).toBe(create);
        expect(container.querySelector('[data-tail]')).toBe(tail);
        expect(input.isConnected).toBe(true);
        expect(document.activeElement).toBe(input);
        expect(input.value).toBe(edit.value);
        expect(input.selectionStart).toBe(edit.start);
        expect(input.selectionEnd).toBe(edit.end);
        expect(input.selectionDirection).toBe(edit.direction);
        expect(findOwnerHost(container, modalOwner)).toBe(ownershipHost);
        expectSameOwners(ownershipHost!, owners);
        expect(modalMounts).toBe(1);
        expect(modalCleanups).toBe(0);
      }

      postgresItem.click();
      flushScheduler();

      expect(container.querySelector('[data-select-trigger]')).toBe(
        selectTrigger
      );
      expect(container.querySelector('[data-select-value]')).toBe(selectValue);
      expect(selectValue?.textContent).toBe('postgres');
      expect(container.querySelector('[data-select-content]')).toBe(
        selectContent
      );
      expect(container.querySelector('[data-select-item="postgres"]')).toBe(
        postgresItem
      );
      expect(postgresItem.dataset.current).toBe('1');
      expect(container.querySelector('[data-create]')).toBe(create);
      expect(create.disabled).toBe(false);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(4);
      expect(input.selectionEnd).toBe(4);
      expect(findOwnerHost(container, modalOwner)).toBe(ownershipHost);
      expectSameOwners(ownershipHost!, owners);
      expect(modalMounts).toBe(1);
      expect(modalCleanups).toBe(0);

      create.click();
      expect(created).toEqual([{ database: 'postgres', name: 'Ada Lovelace' }]);
    } finally {
      cleanup();
    }

    expect(modalCleanups).toBe(modalMounts);
  });

  it('should preserve a controlled rename editor inside a reordered keyed row', () => {
    const { container, cleanup } = createTestContainer();
    const first = { id: 'orders', title: 'Orders' };
    const second = { id: 'users', title: 'Users' };
    const renamed: Array<{ id: string; title: string }> = [];
    let setRows!: (rows: Array<{ id: string; title: string }>) => void;

    const Input = (
      props: Record<string, unknown> & {
        value: string;
      }
    ) => <input {...props} />;

    const Button = ({
      children,
      ...props
    }: Record<string, unknown> & { children: unknown }) => (
      <button {...props}>{children}</button>
    );

    const SavedQueryListItem = ({
      query,
    }: {
      query: { id: string; title: string };
    }) => {
      const editing = state(false);
      const draft = state(query.title);
      const save = () => {
        if (!draft().trim()) return;
        renamed.push({ id: query.id, title: draft() });
        editing.set(false);
      };
      const cancel = () => {
        draft.set(query.title);
        editing.set(false);
      };

      return (
        <li data-saved-query={query.id}>
          <Show
            when={editing()}
            fallback={
              <>
                <strong>{query.title}</strong>
                <Button
                  type={'button'}
                  aria-label={`Rename ${query.title}`}
                  onClick={() => editing.set(true)}
                >
                  {'Rename'}
                </Button>
              </>
            }
          >
            <Input
              aria-label={`Query name for ${query.title}`}
              value={draft()}
              onInput={(event: Event) =>
                draft.set((event.currentTarget as HTMLInputElement).value)
              }
              onKeyDown={(event: KeyboardEvent) => {
                if (event.key === 'Enter') save();
                if (event.key === 'Escape') cancel();
              }}
            />
            <Button
              type={'button'}
              aria-label={'Save query name'}
              disabled={!draft().trim()}
              onClick={save}
            >
              {'Save'}
            </Button>
            <Button
              type={'button'}
              aria-label={'Cancel renaming'}
              onClick={cancel}
            >
              {'Cancel'}
            </Button>
          </Show>
        </li>
      );
    };

    const App = () => {
      const rows = state([first, second]);
      setRows = rows.set;
      return (
        <ul>
          <For each={() => rows()} by={(query) => query.id}>
            {(query) => <SavedQueryListItem query={query} />}
          </For>
        </ul>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const row = container.querySelector(
        '[data-saved-query="orders"]'
      ) as InstanceHost;
      const siblingRow = container.querySelector('[data-saved-query="users"]');
      const rowOwners = [...(row.__ASKR_INSTANCES ?? [])];
      (
        container.querySelector(
          'button[aria-label="Rename Orders"]'
        ) as HTMLButtonElement
      ).click();
      flushScheduler();

      const input = container.querySelector(
        'input[aria-label="Query name for Orders"]'
      ) as HTMLInputElement;
      const save = container.querySelector(
        'button[aria-label="Save query name"]'
      ) as HTMLButtonElement;
      const cancel = container.querySelector(
        'button[aria-label="Cancel renaming"]'
      ) as HTMLButtonElement;

      expect(input).toBeTruthy();
      expect(save).toBeTruthy();
      expect(cancel).toBeTruthy();
      input.focus();

      for (const edit of [
        { value: 'Orders 2', caret: 6 },
        { value: 'Orders archive', caret: 7 },
        { value: 'Renamed orders', caret: 14 },
      ]) {
        input.value = edit.value;
        input.setSelectionRange(edit.caret, edit.caret);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        flushScheduler();

        expect(
          container.querySelector('input[aria-label="Query name for Orders"]')
        ).toBe(input);
        expect(
          container.querySelector('button[aria-label="Save query name"]')
        ).toBe(save);
        expect(
          container.querySelector('button[aria-label="Cancel renaming"]')
        ).toBe(cancel);
        expect(container.querySelector('[data-saved-query="orders"]')).toBe(
          row
        );
        expect(container.querySelector('[data-saved-query="users"]')).toBe(
          siblingRow
        );
        expect(document.activeElement).toBe(input);
        expect(input.selectionStart).toBe(edit.caret);
        expect(input.selectionEnd).toBe(edit.caret);
        expect(input.value).toBe(edit.value);
        expect(save.disabled).toBe(false);
        expectSameOwners(row, rowOwners);
      }

      setRows([second, first]);
      flushScheduler();

      expect(
        Array.from(container.querySelectorAll('[data-saved-query]'), (item) =>
          item.getAttribute('data-saved-query')
        )
      ).toEqual(['users', 'orders']);
      expect(container.querySelector('[data-saved-query="orders"]')).toBe(row);
      expect(
        container.querySelector('input[aria-label="Query name for Orders"]')
      ).toBe(input);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(14);
      expect(input.selectionEnd).toBe(14);
      expectSameOwners(row, rowOwners);

      save.click();
      flushScheduler();

      expect(renamed).toEqual([{ id: 'orders', title: 'Renamed orders' }]);
      expect(
        container.querySelector('input[aria-label="Query name for Orders"]')
      ).toBeNull();
      expect(container.querySelector('[data-saved-query="orders"]')).toBe(row);
      expect(container.querySelector('[data-saved-query="users"]')).toBe(
        siblingRow
      );
    } finally {
      cleanup();
    }
  });

  it('should keep range interiors out of a mixed keyed parent cursor', () => {
    const { container, cleanup } = createTestContainer();

    const PrefixRange = () => (
      <>
        <span key={'shared'} data-prefix={'first'}>
          {'first'}
        </span>
        <em data-prefix={'second'}>{'second'}</em>
      </>
    );

    const App = () => {
      const draft = state('');
      return (
        <section>
          <button key={'shared'} type={'button'} data-outer={'true'}>
            {'outer'}
          </button>
          <PrefixRange />
          <input
            aria-label={'Range-adjacent name'}
            value={draft()}
            onInput={(event: Event) =>
              draft.set((event.currentTarget as HTMLInputElement).value)
            }
          />
        </section>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      const outer = container.querySelector('[data-outer]');
      const first = container.querySelector('[data-prefix="first"]');
      const second = container.querySelector('[data-prefix="second"]');
      const input = container.querySelector(
        'input[aria-label="Range-adjacent name"]'
      ) as HTMLInputElement;

      input.focus();
      input.value = 'Ada Lovelace';
      input.setSelectionRange(3, 8, 'backward');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      flushScheduler();

      expect(container.querySelector('[data-outer]')).toBe(outer);
      expect(container.querySelector('[data-prefix="first"]')).toBe(first);
      expect(container.querySelector('[data-prefix="second"]')).toBe(second);
      expect(
        container.querySelector('input[aria-label="Range-adjacent name"]')
      ).toBe(input);
      expect(
        Array.from(
          container.querySelector('section')!.children,
          (child) => child.tagName
        )
      ).toEqual(['BUTTON', 'SPAN', 'EM', 'INPUT']);
      expect(document.activeElement).toBe(input);
      expect(input.value).toBe('Ada Lovelace');
      expect(input.selectionStart).toBe(3);
      expect(input.selectionEnd).toBe(8);
      expect(input.selectionDirection).toBe('backward');
    } finally {
      cleanup();
    }
  });
});
