import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { For } from '../../../src/control';
import { defineContext, readContext, state } from '../../../src/index';
import {
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('optimization regressions (DOM)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should update context-scoped selection attributes and hidden input after click', () => {
    const SelectionContext = defineContext<string | null>(null);

    const SelectionItem = (props: {
      value: string;
      label: string;
      onSelect: (value: string) => void;
    }) => {
      const selected = readContext(SelectionContext);

      return (
        <button
          type={'button'}
          data-option={props.value}
          aria-checked={selected === props.value ? 'true' : 'false'}
          onClick={() => props.onSelect(props.value)}
        >
          {props.label}
        </button>
      );
    };

    const SelectionShell = (props: {
      selected: string;
      children?: unknown;
    }) => (
      <SelectionContext.Scope value={props.selected}>
        <section data-shell={'selection'}>{props.children}</section>
      </SelectionContext.Scope>
    );

    const App = () => {
      const selected = state('small');

      return (
        <SelectionShell selected={selected()}>
          <div>
            <SelectionItem
              value={'small'}
              label={'Small'}
              onSelect={(value) => selected.set(value)}
            />
          </div>
          <div>
            <SelectionItem
              value={'medium'}
              label={'Medium'}
              onSelect={(value) => selected.set(value)}
            />
          </div>
          <input id={'selected-value'} type={'hidden'} value={selected()} />
        </SelectionShell>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const smallBefore = container.querySelector(
      '[data-option="small"]'
    ) as HTMLButtonElement | null;
    const mediumBefore = container.querySelector(
      '[data-option="medium"]'
    ) as HTMLButtonElement | null;

    expect(smallBefore?.getAttribute('aria-checked')).toBe('true');
    expect(mediumBefore?.getAttribute('aria-checked')).toBe('false');
    expect(
      container.querySelector('#selected-value')?.getAttribute('value')
    ).toBe('small');

    mediumBefore?.click();
    flushScheduler();

    expect(
      container
        .querySelector('[data-option="small"]')
        ?.getAttribute('aria-checked')
    ).toBe('false');
    expect(
      container
        .querySelector('[data-option="medium"]')
        ?.getAttribute('aria-checked')
    ).toBe('true');
    expect(
      container.querySelector('#selected-value')?.getAttribute('value')
    ).toBe('medium');
  });

  it('should keep keyed table rows and sibling summary in sync inside a scoped shell', () => {
    const FilterContext = defineContext('');
    const rows = [
      { id: 'charlie', label: 'Charlie' },
      { id: 'alice', label: 'Alice' },
      { id: 'bob', label: 'Bob' },
    ];

    function getFilteredRows(query: string) {
      const normalized = query.trim().toLowerCase();

      if (!normalized) {
        return rows;
      }

      return rows.filter((row) => row.label.toLowerCase().includes(normalized));
    }

    const FilteredRows = () => {
      const query = readContext(FilterContext);
      const filteredRows = getFilteredRows(query);

      return (
        <For each={() => filteredRows} by={(row) => row.id}>
          {(row) => (
            <tr>
              <td>{row.label}</td>
            </tr>
          )}
        </For>
      );
    };

    const Summary = () => {
      const query = readContext(FilterContext);
      return (
        <p id={'row-summary'}>{`count:${getFilteredRows(query).length}`}</p>
      );
    };

    const FilterShell = (props: { query: string; children?: unknown }) => (
      <FilterContext.Scope value={props.query}>
        <section data-shell={'table'}>{props.children}</section>
      </FilterContext.Scope>
    );

    const App = () => {
      const query = state('');

      return (
        <>
          <button id={'show-all'} onClick={() => query.set('')}>
            {'All'}
          </button>
          <button id={'show-bob'} onClick={() => query.set('Bob')}>
            {'Bob'}
          </button>
          <FilterShell query={query()}>
            <table>
              <tbody>
                <FilteredRows />
              </tbody>
            </table>
            <Summary />
          </FilterShell>
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent).toContain('Charlie');
    expect(container.textContent).toContain('Alice');
    expect(container.textContent).toContain('Bob');
    expect(container.querySelector('#row-summary')?.textContent).toBe(
      'count:3'
    );

    (container.querySelector('#show-bob') as HTMLButtonElement | null)?.click();
    flushScheduler();

    const bodyText = container.querySelector('tbody')?.textContent ?? '';

    expect(bodyText).toContain('Bob');
    expect(bodyText).not.toContain('Charlie');
    expect(bodyText).not.toContain('Alice');
    expect(container.querySelector('#row-summary')?.textContent).toBe(
      'count:1'
    );
  });

  it('should clear portal content when scoped children are removed', () => {
    const MenuContext = defineContext<string | null>(null);

    const PortalPreview = () => {
      const menu = readContext(MenuContext);
      return <p id={'portal-context'}>{menu}</p>;
    };

    const App = () => {
      const open = state(false);

      return (
        <MenuContext.Scope value={'file'}>
          <button id={'toggle-menu'} onClick={() => open.set(!open())}>
            {'File'}
          </button>
          <Portal>{open() ? <PortalPreview /> : null}</Portal>
        </MenuContext.Scope>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const toggleMenu = container.querySelector(
      '#toggle-menu'
    ) as HTMLButtonElement | null;

    toggleMenu?.click();
    flushScheduler();

    expect(container.querySelector('#portal-context')?.textContent).toBe(
      'file'
    );

    toggleMenu?.click();
    flushScheduler();

    expect(container.querySelector('#portal-context')).toBeNull();
  });

  it('should preserve portal context after close and reopen', () => {
    const MenuContext = defineContext<string | null>(null);
    const SubmenuContext = defineContext<string | null>(null);

    const PortalPreview = () => {
      const menu = readContext(MenuContext);
      const submenu = readContext(SubmenuContext);

      return <p id={'portal-context'}>{`${menu}:${submenu}`}</p>;
    };

    const PortalSurface = (props: {
      submenuOpen: boolean;
      onOpenSubmenu: () => void;
    }) => (
      <div id={'menu-surface'}>
        <button id={'open-submenu'} onClick={props.onOpenSubmenu}>
          {'Share'}
        </button>
        {props.submenuOpen ? (
          <SubmenuContext.Scope value={'share'}>
            <PortalPreview />
          </SubmenuContext.Scope>
        ) : null}
      </div>
    );

    const App = () => {
      const open = state(false);
      const submenuOpen = state(false);
      const isOpen = open();
      const isSubmenuOpen = submenuOpen();

      const toggleMenu = () => {
        const nextOpen = !isOpen;
        open.set(nextOpen);
        if (!nextOpen) {
          submenuOpen.set(false);
        }
      };

      return (
        <MenuContext.Scope value={'file'}>
          <button id={'toggle-menu'} onClick={toggleMenu}>
            {'File'}
          </button>
          <Portal>
            {isOpen ? (
              <PortalSurface
                submenuOpen={isSubmenuOpen}
                onOpenSubmenu={() => submenuOpen.set(true)}
              />
            ) : null}
          </Portal>
        </MenuContext.Scope>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    const toggleMenu = container.querySelector(
      '#toggle-menu'
    ) as HTMLButtonElement | null;

    toggleMenu?.click();
    flushScheduler();

    expect(container.querySelector('#menu-surface')?.textContent).toContain(
      'Share'
    );

    (
      container.querySelector('#open-submenu') as HTMLButtonElement | null
    )?.click();
    flushScheduler();

    expect(container.querySelector('#portal-context')?.textContent).toBe(
      'file:share'
    );

    toggleMenu?.click();
    flushScheduler();

    expect(container.querySelector('#portal-context')).toBeNull();

    toggleMenu?.click();
    flushScheduler();
    (
      container.querySelector('#open-submenu') as HTMLButtonElement | null
    )?.click();
    flushScheduler();

    expect(container.querySelector('#portal-context')?.textContent).toBe(
      'file:share'
    );
  });
});
