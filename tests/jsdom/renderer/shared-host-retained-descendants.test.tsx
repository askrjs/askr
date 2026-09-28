import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { defineScope, readScope, state, type State } from '../../../src/index';
import { task } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

async function settle(): Promise<void> {
  flushScheduler();
  for (let i = 0; i < 4; i += 1) {
    await Promise.resolve();
  }
  flushScheduler();
}

// A stateful component that returns a scope provider directly shares its host
// node with the provider's children. Re-rendering it must keep them mounted.
describe('shared host descendants across a self re-render', () => {
  let { container, cleanup } = createTestContainer();
  let events: string[];

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    events = [];
  });

  afterEach(() => cleanup());

  it('should keep a leaf under a scope provider returned directly by a stateful component', async () => {
    const S = defineScope('');
    let t!: State<number>;

    function Leaf() {
      task(() => {
        events.push('mount');
        return () => events.push('cleanup');
      });
      return <p id="leaf">{readScope(S)}</p>;
    }

    function W() {
      t = state(0);
      return (
        <S value={'v' + t()}>
          <Leaf />
        </S>
      );
    }

    createIsland({ root: container, component: () => <W /> });
    await settle();
    const leaf = container.querySelector('#leaf');
    expect(leaf?.textContent).toBe('v0');

    t.set(1);
    await settle();

    expect(container.querySelector('#leaf')).toBe(leaf);
    expect(container.querySelectorAll('#leaf').length).toBe(1);
    expect(leaf?.textContent).toBe('v1');
    expect(events).toEqual(['mount']);
  });

  it('should keep the page mounted when a theme provider changes its theme', async () => {
    const ThemeScope = defineScope<'light' | 'dark'>('light');
    let setTheme!: (theme: 'light' | 'dark') => void;

    function Page() {
      const count = state(0);
      task(() => {
        events.push('page mount');
        return () => events.push('page cleanup');
      });
      return (
        <main id="page" data-theme={readScope(ThemeScope)}>
          <button id="inc" onClick={() => count.set(count() + 1)}>
            {String(count())}
          </button>
        </main>
      );
    }

    function ThemeProvider(props: { children?: unknown }) {
      const theme = state<'light' | 'dark'>('light');
      setTheme = theme.set;
      return <ThemeScope value={theme()}>{props.children}</ThemeScope>;
    }

    const App = () => (
      <ThemeProvider>
        <Page />
      </ThemeProvider>
    );

    createIsland({ root: container, component: App });
    await settle();
    const page = container.querySelector('#page');
    (container.querySelector('#inc') as HTMLButtonElement).click();
    await settle();
    expect(container.querySelector('#inc')?.textContent).toBe('1');

    setTheme('dark');
    await settle();

    expect(container.querySelector('#page')).toBe(page);
    expect(container.querySelectorAll('#page').length).toBe(1);
    expect(page?.getAttribute('data-theme')).toBe('dark');
    expect(container.querySelector('#inc')?.textContent).toBe('1');
    expect(events).toEqual(['page mount']);
  });
});

// A chain of the same component type records every link on the leaf host.
// Re-rendering any link must find each deeper link by its parent, whichever
// link the reconciliation walk starts from.
describe('same-type wrapper chain across re-renders', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it.each([
    ['the root', ['root', 'root']],
    ['a middle link', [2, 'root', 2]],
    ['links at several depths', [3, 1, 'root', 2]],
  ] as const)(
    'should retain every link after re-rendering %s',
    (_label, renders) => {
      const depth = 4;
      const counts: Array<State<number>> = [];
      let rootLabel!: State<string>;

      function Nested({ level, label }: { level: number; label: string }) {
        const count = state(0);
        counts[level] = count;
        return level === 0 ? (
          <button id="leaf">
            {label}:{count()}
          </button>
        ) : (
          <Nested level={level - 1} label={label + count()} />
        );
      }

      function App() {
        rootLabel = state('r');
        return <Nested level={depth} label={rootLabel()} />;
      }

      createIsland({ root: container, component: App });
      counts[0]!.set(7);
      flushScheduler();
      const leaf = container.querySelector('#leaf');
      const mountedCounts = counts.slice();

      renders.forEach((link, index) => {
        if (link === 'root') rootLabel.set(`r${index}`);
        else counts[link]!.set(index + 1);
        flushScheduler();

        expect(container.querySelector('#leaf')).toBe(leaf);
        expect(leaf?.textContent?.endsWith(':7')).toBe(true);
        expect(counts).toEqual(mountedCounts);
      });
    }
  );
});
