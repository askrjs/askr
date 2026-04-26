import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  defineContext,
  markVNodeTreeWithContextFrame,
  readContext,
} from '../../../src/runtime/context';
import { Portal, Slot, state } from '../../../src/index';
import { _resetDefaultPortal } from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import type { JSXElement } from '../../../src/jsx/types';

describe('renderer context frame invariants', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
    _resetDefaultPortal();
  });

  it('should render context consumers from frozen scoped children', () => {
    const ThemeContext = defineContext('light');

    const Reader = () => {
      const theme = readContext(ThemeContext);
      return <span id={'theme-value'}>{theme}</span>;
    };

    const App = () => {
      const child = Object.freeze(<Reader />) as JSXElement;

      return <ThemeContext.Scope value={'dark'}>{child}</ThemeContext.Scope>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#theme-value')?.textContent).toBe('dark');
  });

  it('should preserve context for frozen portal children rendered later', () => {
    const MenuContext = defineContext('none');

    const PortalReader = () => {
      const menu = readContext(MenuContext);
      return <p id={'portal-context'}>{menu}</p>;
    };

    const PortalWriter = () => {
      const child = Object.freeze(<PortalReader />) as JSXElement;
      return <Portal>{child}</Portal>;
    };

    const App = () => (
      <MenuContext.Scope value={'file'}>
        <PortalWriter />
      </MenuContext.Scope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#portal-context')?.textContent).toBe(
      'file'
    );
  });

  it('should preserve context when Slot clones frozen asChild children', () => {
    const ThemeContext = defineContext('light');

    const Reader = (props: { id: string; 'data-slot-prop'?: string }) => {
      const theme = readContext(ThemeContext);
      return (
        <a id={props.id} data-slot-prop={props['data-slot-prop']}>
          {theme}
        </a>
      );
    };

    const SlottedReader = () => {
      const child = Object.freeze(
        <Reader id={'slotted-theme'} />
      ) as JSXElement;
      return (
        <Slot asChild data-slot-prop={'merged'}>
          {child}
        </Slot>
      );
    };

    const App = () => (
      <ThemeContext.Scope value={'dark'}>
        <SlottedReader />
      </ThemeContext.Scope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const link = container.querySelector('#slotted-theme');
    expect(link?.textContent).toBe('dark');
    expect(link?.getAttribute('data-slot-prop')).toBe('merged');
  });

  it('should preserve context when scoped children are cloned with object spread', () => {
    const ThemeContext = defineContext('light');

    const Reader = () => {
      const theme = readContext(ThemeContext);
      return <span id={'spread-cloned-theme'}>{theme}</span>;
    };

    const SpreadCloneView = (props: { children?: JSXElement }) => {
      if (!props.children) {
        return null;
      }

      const cloned = { ...props.children, key: 'spread-cloned' } as JSXElement;
      return <>{cloned}</>;
    };

    const App = () => (
      <ThemeContext.Scope value={'dark'}>
        <SpreadCloneView>
          <Reader />
        </SpreadCloneView>
      </ThemeContext.Scope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#spread-cloned-theme')?.textContent).toBe(
      'dark'
    );
  });

  it('should override stale frames on vnode props inside a provider', () => {
    const ThemeContext = defineContext('light');

    const Reader = () => {
      const theme = readContext(ThemeContext);
      return <span id={'prop-node-theme'}>{theme}</span>;
    };

    const NodeView = (props: { node: JSXElement }) => props.node;

    const App = () => {
      const node = <Reader />;
      markVNodeTreeWithContextFrame(
        node,
        {
          parent: null,
          values: new Map([[ThemeContext.key, 'outer']]),
        },
        true
      );

      return (
        <ThemeContext.Scope value={'inner'}>
          <NodeView node={node} />
        </ThemeContext.Scope>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#prop-node-theme')?.textContent).toBe(
      'inner'
    );
  });

  it('should render local portal writes before later sibling hosts', () => {
    type LocalPortal = (() => JSXElement | null) & {
      render(props: { children?: unknown }): null;
    };

    function createLocalPortal(): LocalPortal {
      let value: unknown = null;

      const LocalPortalHost = (() => value as JSXElement | null) as LocalPortal;
      LocalPortalHost.render = (props: { children?: unknown }) => {
        value = props.children ?? null;
        return null;
      };

      return LocalPortalHost;
    }

    const LocalPortalHost = createLocalPortal();

    const PortalWriter = (props: { open: boolean }) => {
      return LocalPortalHost.render({
        children: props.open ? (
          <div id={'local-portal-surface'}>
            <button>{'Share'}</button>
          </div>
        ) : null,
      });
    };

    const App = () => {
      const open = state(false);

      return (
        <>
          <button id={'open-local-portal'} onClick={() => open.set(true)}>
            {'File'}
          </button>
          <div>
            <PortalWriter open={open()} />
          </div>
          {[<LocalPortalHost key={'local-portal-host'} />]}
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#local-portal-surface')).toBeNull();

    (
      container.querySelector('#open-local-portal') as HTMLButtonElement
    ).click();
    flushScheduler();

    expect(container.querySelector('#local-portal-surface')?.textContent).toBe(
      'Share'
    );
  });
});
