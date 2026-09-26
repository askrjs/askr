import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import { ErrorBoundary } from '@askrjs/askr/components';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function failNextInsertInto(parent: string | Element, error: Error) {
  const insertBefore = Element.prototype.insertBefore;
  let armed = true;
  return vi
    .spyOn(Element.prototype, 'insertBefore')
    .mockImplementation(function <T extends Node>(
      this: Element,
      node: T,
      child: Node | null
    ): T {
      if (
        armed &&
        (typeof parent === 'string' ? this.id === parent : this === parent)
      ) {
        armed = false;
        throw error;
      }
      return insertBefore.call(this, node, child) as T;
    });
}

// A failing reconciliation commit must surface through the component update
// transaction (rollback, then the nearest ErrorBoundary or the flush), never
// be papered over by rebuilding the parent with replaceChildren().
describe('reconciliation commit errors', () => {
  let container: HTMLElement;
  let cleanup: () => void;
  let flip!: State<boolean>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Small keyed lists that reorder and grow take full reconciliation.
  const List = () => {
    flip = state(false);
    const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
    return (
      <ul id="list">
        {keys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ul>
    );
  };

  it('should roll back and throw a commit error instead of replacing children', () => {
    createIsland({ root: container, component: List });
    flushScheduler();
    const stable = container.innerHTML;
    const list = container.querySelector('#list')!;
    const stableChildren = Array.from(list.childNodes);

    const error = new Error('commit failed');
    failNextInsertInto('list', error);
    const replaceChildren = vi.spyOn(Element.prototype, 'replaceChildren');

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(replaceChildren).not.toHaveBeenCalledWith(expect.anything());
    expect(container.innerHTML).toBe(stable);
    expect(Array.from(list.childNodes)).toEqual(stableChildren);
  });

  it('should route a commit error to the nearest ErrorBoundary', () => {
    const onError = vi.fn();
    const App = () => (
      <ErrorBoundary onError={onError}>
        <List />
      </ErrorBoundary>
    );
    createIsland({ root: container, component: App });
    flushScheduler();

    const error = new Error('commit failed');
    failNextInsertInto('list', error);

    flip.set(true);
    flushScheduler();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toBe(error);
    expect(container.querySelector('[data-askr-error-boundary]')).toBeTruthy();
  });

  it.each(['data-key', 'data-askr-key-kind'])(
    'should surface a failed %s write in forced bulk reuse',
    (attribute) => {
      const previousFlag = process.env.ASKR_FORCE_BULK_POSREUSE;
      process.env.ASKR_FORCE_BULK_POSREUSE = '1';
      let keys!: State<string[]>;
      const App = () => {
        keys = state(['a', 'b']);
        return (
          <ul>
            {keys().map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        );
      };

      try {
        createIsland({ root: container, component: App });
        flushScheduler();
        const stable = container.innerHTML;
        const first = container.querySelector('li')!;
        const write = Element.prototype.setAttribute;
        const failure = new Error('key write failed');
        vi.spyOn(first, 'setAttribute').mockImplementation((name, value) => {
          if (name === attribute) throw failure;
          write.call(first, name, value);
        });

        keys.set(['c', 'd']);
        expect(() => flushScheduler()).toThrow(failure);
        expect(container.innerHTML).toBe(stable);
      } finally {
        if (previousFlag === undefined)
          delete process.env.ASKR_FORCE_BULK_POSREUSE;
        else process.env.ASKR_FORCE_BULK_POSREUSE = previousFlag;
      }
    }
  );
});

// Reactive child functions commit outside a component update, so they need
// their own rollback and must route failures like reactive prop bindings.
describe.each(['development', 'production'])(
  'reactive child commit errors (%s)',
  (nodeEnv) => {
    let container: HTMLElement;
    let cleanup: () => void;
    let previousNodeEnv: string | undefined;
    let keys!: State<string[]>;
    const clicks: string[] = [];

    beforeEach(() => {
      previousNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = nodeEnv;
      clicks.length = 0;
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      ({ container, cleanup } = createTestContainer());
    });

    afterEach(() => {
      cleanup();
      process.env.NODE_ENV = previousNodeEnv;
      vi.restoreAllMocks();
    });

    const List = () => {
      keys = state(['a', 'b', 'x']);
      return (
        <div>
          <ul id="rlist">
            {() =>
              keys().map((key) => (
                <li key={key} id={`r-${key}`} onClick={() => clicks.push(key)}>
                  {key}
                </li>
              ))
            }
          </ul>
        </div>
      );
    };

    it('should roll back and throw a reactive child commit error', () => {
      createIsland({ root: container, component: List });
      flushScheduler();
      const stable = container.innerHTML;
      const items = Array.from(container.querySelectorAll('li'));

      const error = new Error('reactive commit failed');
      const insert = failNextInsertInto('rlist', error);

      expect(() => {
        keys.set(['b', 'a', 'c']);
        flushScheduler();
      }).toThrow(error);

      expect(container.innerHTML).toBe(stable);
      expect(Array.from(container.querySelectorAll('li'))).toEqual(items);
      container.querySelector<HTMLElement>('#r-x')!.click();
      expect(clicks).toEqual(['x']);

      insert.mockRestore();
      keys.set(['c', 'b']);
      flushScheduler();
      expect(
        Array.from(container.querySelectorAll('li')).map((li) => li.id)
      ).toEqual(['r-c', 'r-b']);
      container.querySelector<HTMLElement>('#r-c')!.click();
      expect(clicks).toEqual(['x', 'c']);
    });

    it('should route a reactive child commit error to the nearest ErrorBoundary', () => {
      const onError = vi.fn();
      const App = () => (
        <ErrorBoundary onError={onError}>
          <List />
        </ErrorBoundary>
      );
      createIsland({ root: container, component: App });
      flushScheduler();

      const error = new Error('reactive commit failed');
      failNextInsertInto('rlist', error);

      keys.set(['b', 'a', 'c']);
      flushScheduler();

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError.mock.calls[0][0]).toBe(error);
      expect(
        container.querySelector('[data-askr-error-boundary]')
      ).toBeTruthy();
    });

    it('should roll back a blueprint reactive child commit error', () => {
      let items!: State<string[] | null>;
      const cloneNode = vi.spyOn(Node.prototype, 'cloneNode');
      // Starts as text so the second row takes the blueprint text binding,
      // then switches to a keyed list through that same binding.
      const Row = ({ index }: { index: number }) => (
        <ul>
          {() => {
            const keys = items();
            return keys
              ? keys.map((key) => <li key={key}>{`${index}${key}`}</li>)
              : `empty ${index}`;
          }}
        </ul>
      );
      const App = () => {
        items = state<string[] | null>(null);
        return (
          <div>
            <Row index={1} />
            <Row index={2} />
          </div>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(cloneNode).toHaveBeenCalled();
      items.set(['a', 'b', 'x']);
      flushScheduler();
      const blueprintList = container.querySelectorAll('ul')[1]!;
      const stable = blueprintList.innerHTML;
      expect(blueprintList.querySelectorAll('li')).toHaveLength(3);

      const error = new Error('blueprint commit failed');
      failNextInsertInto(blueprintList, error);

      expect(() => {
        items.set(['b', 'a', 'c']);
        flushScheduler();
      }).toThrow(error);
      expect(blueprintList.innerHTML).toBe(stable);
    });
  }
);
