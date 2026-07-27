import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  defineScope,
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
  readScope,
  rebaseVNodeTreeWithContextFrame,
  withContext,
  type ContextFrame,
} from '../../../src/runtime/context';
import { Case, For, Match, Show, state } from '../../../src/index';
import { Portal, Slot } from '@askrjs/askr/foundations';
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
    const ThemeScope = defineScope('light');

    const Reader = () => {
      const theme = readScope(ThemeScope);
      return <span id={'theme-value'}>{theme}</span>;
    };

    const App = () => {
      const child = Object.freeze(<Reader />) as JSXElement;

      return <ThemeScope value={'dark'}>{child}</ThemeScope>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#theme-value')?.textContent).toBe('dark');
  });

  it('should preserve context for frozen portal children rendered later', () => {
    const MenuScope = defineScope('none');

    const PortalReader = () => {
      const menu = readScope(MenuScope);
      return <p id={'portal-context'}>{menu}</p>;
    };

    const PortalWriter = () => {
      const child = Object.freeze(<PortalReader />) as JSXElement;
      return <Portal>{child}</Portal>;
    };

    const App = () => (
      <MenuScope value={'file'}>
        <PortalWriter />
      </MenuScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#portal-context')?.textContent).toBe(
      'file'
    );
  });

  it('should preserve context when Slot clones frozen asChild children', () => {
    const ThemeScope = defineScope('light');

    const Reader = (props: { id: string; 'data-slot-prop'?: string }) => {
      const theme = readScope(ThemeScope);
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
      <ThemeScope value={'dark'}>
        <SlottedReader />
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    const link = container.querySelector('#slotted-theme');
    expect(link?.textContent).toBe('dark');
    expect(link?.getAttribute('data-slot-prop')).toBe('merged');
  });

  it('should preserve context when scoped children are cloned with object spread', () => {
    const ThemeScope = defineScope('light');

    const Reader = () => {
      const theme = readScope(ThemeScope);
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
      <ThemeScope value={'dark'}>
        <SpreadCloneView>
          <Reader />
        </SpreadCloneView>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#spread-cloned-theme')?.textContent).toBe(
      'dark'
    );
  });

  it('should preserve context for children rendered by For', () => {
    const ThemeScope = defineScope('light');

    const Reader = (props: { id: string }) => {
      const theme = readScope(ThemeScope);
      return <span id={props.id}>{theme}</span>;
    };

    const App = () => (
      <ThemeScope value={'dark'}>
        <For each={['first', 'second']} by={(item) => item}>
          {(item) => <Reader id={`for-theme-${item}`} />}
        </For>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#for-theme-first')?.textContent).toBe(
      'dark'
    );
    expect(container.querySelector('#for-theme-second')?.textContent).toBe(
      'dark'
    );
  });

  it('should refresh stable For and Show children when a provider changes', () => {
    const ThemeScope = defineScope('light');
    const items = ['stable'];
    let setTheme: (value: string) => void = () => undefined;
    let forRowRenderCount = 0;

    const Reader = (props: { id: string }) => {
      const theme = readScope(ThemeScope);
      return <span id={props.id}>{theme}</span>;
    };

    const App = () => {
      const theme = state('dark');
      setTheme = theme.set;

      return (
        <ThemeScope value={theme()}>
          <For each={items} by={(item) => item}>
            {(item) => {
              forRowRenderCount += 1;
              return <Reader id={`stable-for-theme-${item}`} />;
            }}
          </For>
          <Show when={true}>
            <Reader id={'stable-show-theme'} />
          </Show>
        </ThemeScope>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(
      container.querySelector('#stable-for-theme-stable')?.textContent
    ).toBe('dark');
    expect(container.querySelector('#stable-show-theme')?.textContent).toBe(
      'dark'
    );
    expect(forRowRenderCount).toBe(1);

    setTheme('contrast');
    flushScheduler();

    expect(
      container.querySelector('#stable-for-theme-stable')?.textContent
    ).toBe('contrast');
    expect(container.querySelector('#stable-show-theme')?.textContent).toBe(
      'contrast'
    );
    expect(forRowRenderCount).toBe(2);
  });

  it('should preserve stable For rows when provider context is unchanged', () => {
    const ThemeScope = defineScope('light');
    const items = ['stable'];
    let bumpUnrelatedState = () => undefined;
    let rowRenderCount = 0;

    const Reader = () => {
      return <span id={'stable-row-theme'}>{readScope(ThemeScope)}</span>;
    };

    const App = () => {
      const unrelated = state(0);
      bumpUnrelatedState = () => unrelated.set(unrelated() + 1);

      return (
        <div data-unrelated={String(unrelated())}>
          <ThemeScope value={'dark'}>
            <For each={items} by={(item) => item}>
              {() => {
                rowRenderCount += 1;
                return <Reader />;
              }}
            </For>
          </ThemeScope>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(rowRenderCount).toBe(1);
    bumpUnrelatedState();
    flushScheduler();

    expect(container.firstElementChild?.getAttribute('data-unrelated')).toBe(
      '1'
    );
    expect(container.querySelector('#stable-row-theme')?.textContent).toBe(
      'dark'
    );
    expect(rowRenderCount).toBe(1);
  });

  it('should use the nearest provider for For children', () => {
    const ThemeScope = defineScope('light');

    const Reader = () => (
      <span id={'nested-for-theme'}>{readScope(ThemeScope)}</span>
    );

    const App = () => (
      <ThemeScope value={'outer'}>
        <ThemeScope value={'inner'}>
          <For each={['row']} by={(item) => item}>
            {() => <Reader />}
          </For>
        </ThemeScope>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#nested-for-theme')?.textContent).toBe(
      'inner'
    );
  });

  it('should preserve nested provider precedence inside a For child scope', () => {
    const ThemeScope = defineScope('light');
    const Reader = () => (
      <span id={'nested-provider-for-theme'}>{readScope(ThemeScope)}</span>
    );
    const App = () => (
      <ThemeScope value={'outer'}>
        <For each={['row']} by={(item) => item}>
          {() => (
            <ThemeScope value={'inner'}>
              <Reader />
            </ThemeScope>
          )}
        </For>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(
      container.querySelector('#nested-provider-for-theme')?.textContent
    ).toBe('inner');
  });

  it('should rebase stale outer context without dropping a nested provider', () => {
    const OuterScope = defineScope('light');
    const InnerScope = defineScope('missing');
    const staleOuterFrame: ContextFrame = {
      parent: null,
      values: new Map([[OuterScope.key, 'dark']]),
    };
    const nestedFrame: ContextFrame = {
      parent: staleOuterFrame,
      values: new Map([[InnerScope.key, 'inner']]),
    };
    const currentOuterFrame: ContextFrame = {
      parent: null,
      values: new Map([[OuterScope.key, 'contrast']]),
    };
    const cachedSubtree = <div />;
    markVNodeTreeWithContextFrame(cachedSubtree, nestedFrame, true);

    rebaseVNodeTreeWithContextFrame(
      cachedSubtree,
      currentOuterFrame,
      staleOuterFrame
    );

    const rebasedFrame = getVNodeContextFrame(cachedSubtree);
    expect(rebasedFrame).toBeDefined();
    expect(
      withContext(rebasedFrame ?? null, () => [
        readScope(OuterScope),
        readScope(InnerScope),
      ])
    ).toEqual(['contrast', 'inner']);
  });

  it('should not stamp plain objects from array-valued vnode props', () => {
    const plainObject = { id: 'user-data' };
    const ownerFrame: ContextFrame = {
      parent: null,
      values: new Map(),
    };
    const Carrier = (_props: { items: object[] }) => <div />;
    const vnode = <Carrier items={[plainObject]} />;

    rebaseVNodeTreeWithContextFrame(vnode, ownerFrame);

    expect(getVNodeContextFrame(vnode)).toBe(ownerFrame);
    expect(getVNodeContextFrame(plainObject)).toBeUndefined();
    expect(plainObject).toEqual({ id: 'user-data' });
  });

  it('should refresh an empty For fallback exactly once with new context', () => {
    const ThemeScope = defineScope('light');
    const items: readonly string[] = [];
    let setTheme = (_value: string) => undefined;
    let fallbackRenderCount = 0;
    const renderedThemes: string[] = [];
    const Fallback = () => {
      fallbackRenderCount += 1;
      const theme = readScope(ThemeScope);
      renderedThemes.push(theme);
      return <span id={'for-fallback-theme'}>{theme}</span>;
    };
    const App = () => {
      const theme = state('dark');
      setTheme = theme.set;
      return (
        <ThemeScope value={theme()}>
          <For each={items} by={(item) => item} fallback={<Fallback />}>
            {(item) => <span>{item}</span>}
          </For>
        </ThemeScope>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(fallbackRenderCount).toBe(1);
    expect(renderedThemes).toEqual(['dark']);
    expect(container.querySelector('#for-fallback-theme')?.textContent).toBe(
      'dark'
    );

    setTheme('contrast');
    flushScheduler();

    expect(fallbackRenderCount).toBe(2);
    expect(renderedThemes).toEqual(['dark', 'contrast']);
    expect(container.querySelector('#for-fallback-theme')?.textContent).toBe(
      'contrast'
    );
  });

  it('should preserve context for children rendered by Show', () => {
    const ThemeScope = defineScope('light');

    const Reader = () => {
      const theme = readScope(ThemeScope);
      return <span id={'show-theme'}>{theme}</span>;
    };

    const App = () => (
      <ThemeScope value={'dark'}>
        <Show when={true}>
          <Reader />
        </Show>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#show-theme')?.textContent).toBe('dark');
  });

  it('should preserve context for children rendered by Case', () => {
    const ThemeScope = defineScope('light');

    const Reader = () => <span id={'case-theme'}>{readScope(ThemeScope)}</span>;

    const App = () => (
      <ThemeScope value={'dark'}>
        <Case>
          <Match when={true}>
            <Reader />
          </Match>
        </Case>
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#case-theme')?.textContent).toBe('dark');
  });

  it('should preserve context for keyed computed-array children', () => {
    const ThemeScope = defineScope('light');

    const Reader = (props: { id: string }) => {
      const theme = readScope(ThemeScope);
      return <span id={props.id}>{theme}</span>;
    };

    const App = () => (
      <ThemeScope value={'dark'}>
        {['first', 'second'].map((item) => (
          <Reader key={item} id={`array-theme-${item}`} />
        ))}
      </ThemeScope>
    );

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.querySelector('#array-theme-first')?.textContent).toBe(
      'dark'
    );
    expect(container.querySelector('#array-theme-second')?.textContent).toBe(
      'dark'
    );
  });

  it('should override stale frames on vnode props inside a provider', () => {
    const ThemeScope = defineScope('light');

    const Reader = () => {
      const theme = readScope(ThemeScope);
      return <span id={'prop-node-theme'}>{theme}</span>;
    };

    const NodeView = (props: { node: JSXElement }) => props.node;

    const App = () => {
      const node = <Reader />;
      markVNodeTreeWithContextFrame(
        node,
        {
          parent: null,
          values: new Map([[ThemeScope.key, 'outer']]),
        },
        true
      );

      return (
        <ThemeScope value={'inner'}>
          <NodeView node={node} />
        </ThemeScope>
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
