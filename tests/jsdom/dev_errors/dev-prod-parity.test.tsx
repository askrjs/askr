import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import { Case, For, Match } from '../../../src/control';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

type Row = { id: number; n: string };

describe.each(['development', 'production'] as const)(
  'dev/prod parity (%s)',
  (mode) => {
    let { container, cleanup } = createTestContainer();
    let previousNodeEnv: string | undefined;

    beforeEach(() => {
      ({ container, cleanup } = createTestContainer());
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = mode;
      vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      cleanup();
      process.env.NODE_ENV = previousNodeEnv;
      vi.restoreAllMocks();
    });

    function renderList(
      initial: Row[],
      source: 'accessor' | 'parent-render' = 'accessor'
    ): { rows: State<Row[]> } {
      let rows!: State<Row[]>;
      const App = () => {
        rows = state(initial);
        const each = source === 'accessor' ? () => rows() : rows();
        return (
          <div>
            <p id="outside">outside</p>
            <ErrorBoundary
              fallback={(error) => (
                <p id="list-fallback">{String((error as Error).message)}</p>
              )}
            >
              <ul>
                <For each={each} by={(row) => row.id}>
                  {(row) => <li>{row.n}</li>}
                </For>
              </ul>
            </ErrorBoundary>
          </div>
        );
      };

      createIsland({ root: container, component: App });
      flushScheduler();
      return { rows };
    }

    it('should route duplicate For keys to the nearest ErrorBoundary on mount', () => {
      renderList([
        { id: 1, n: 'a' },
        { id: 1, n: 'b' },
        { id: 2, n: 'c' },
      ]);

      expect(container.querySelector('#outside')?.textContent).toBe('outside');
      expect(container.querySelector('#list-fallback')?.textContent).toMatch(
        /Duplicate For key detected: 1/
      );
      expect(container.querySelectorAll('li')).toHaveLength(0);
    });

    it.each(['accessor', 'parent-render'] as const)(
      'should route duplicate For keys introduced by an update to the nearest ErrorBoundary (%s source)',
      (source) => {
        const { rows } = renderList(
          [
            { id: 1, n: 'a' },
            { id: 2, n: 'b' },
          ],
          source
        );
        expect(container.querySelectorAll('li')).toHaveLength(2);

        rows.set([
          { id: 1, n: 'a' },
          { id: 2, n: 'b' },
          { id: 2, n: 'c' },
        ]);
        flushScheduler();

        expect(container.querySelector('#outside')?.textContent).toBe(
          'outside'
        );
        expect(container.querySelector('#list-fallback')?.textContent).toMatch(
          /Duplicate For key detected: 2/
        );
      }
    );

    it('should route null For keys to the nearest ErrorBoundary', () => {
      renderList([
        { id: 1, n: 'a' },
        { id: null as unknown as number, n: 'b' },
      ]);

      expect(container.querySelector('#outside')?.textContent).toBe('outside');
      expect(container.querySelector('#list-fallback')?.textContent).toMatch(
        /Invalid For key detected/
      );
    });

    it('should route a non-Match Case child to the nearest ErrorBoundary', () => {
      const App = () => (
        <div>
          <p id="outside">outside</p>
          <ErrorBoundary
            fallback={(error) => (
              <p id="case-fallback">{String((error as Error).message)}</p>
            )}
          >
            <Case>
              <Match when={true}>
                <span id="matched">matched</span>
              </Match>
              <span id="stray">stray</span>
            </Case>
          </ErrorBoundary>
        </div>
      );

      createIsland({ root: container, component: App });
      flushScheduler();

      expect(container.querySelector('#outside')?.textContent).toBe('outside');
      expect(container.querySelector('#case-fallback')?.textContent).toMatch(
        /<Case> only accepts <Match> children/
      );
      expect(container.querySelector('#matched')).toBeNull();
    });

    it('should route a Match outside Case to the nearest ErrorBoundary', () => {
      const App = () => (
        <div>
          <p id="outside">outside</p>
          <ErrorBoundary
            fallback={(error) => (
              <p id="match-fallback">{String((error as Error).message)}</p>
            )}
          >
            <Match when={true}>
              <span id="orphan">orphan</span>
            </Match>
          </ErrorBoundary>
        </div>
      );

      createIsland({ root: container, component: App });
      flushScheduler();

      expect(container.querySelector('#outside')?.textContent).toBe('outside');
      expect(container.querySelector('#match-fallback')?.textContent).toMatch(
        /<Match> may only be used as a direct child of <Case>/
      );
      expect(container.querySelector('#orphan')).toBeNull();
    });
  }
);
