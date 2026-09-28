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

  it('should restore earlier placement when a later keyed move mutates then throws', () => {
    createIsland({ root: container, component: List });
    flushScheduler();
    const list = container.querySelector('#list')!;
    const stableChildren = Array.from(list.children);
    const error = new Error('keyed move failed after mutation');
    const insertBefore = list.insertBefore.bind(list);
    let didFail = false;
    let insertedNewChild = false;
    const insertion = vi
      .spyOn(list, 'insertBefore')
      .mockImplementation((node, before) => {
        const inserted = insertBefore(node, before);
        if ((node as Element).textContent === 'c') insertedNewChild = true;
        if (node === stableChildren[1] && !didFail) {
          didFail = true;
          throw error;
        }
        return inserted;
      });

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(didFail).toBe(true);
    expect(insertedNewChild).toBe(true);
    expect(Array.from(list.children)).toEqual(stableChildren);
    expect(list.children[0]).toBe(stableChildren[0]);
    expect(list.children[1]).toBe(stableChildren[1]);
    expect(Array.from(list.children, (child) => child.textContent)).toEqual([
      'a',
      'b',
    ]);

    insertion.mockRestore();
    flip.set(false);
    flushScheduler();
    flip.set(true);
    flushScheduler();

    expect(Array.from(list.children, (child) => child.textContent)).toEqual([
      'b',
      'a',
      'c',
    ]);
    expect(list.children[0]).toBe(stableChildren[1]);
    expect(list.children[1]).toBe(stableChildren[0]);
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

  it('should restore earlier sibling lists when a later insertion fails', () => {
    const App = () => {
      flip = state(false);
      const left = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      const right = flip() ? ['y', 'x', 'z'] : ['x', 'y'];
      return (
        <div>
          <ul id="left">
            {left.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
          <ul id="right">
            {right.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const leftNodes = Array.from(container.querySelector('#left')!.childNodes);
    const rightNodes = Array.from(
      container.querySelector('#right')!.childNodes
    );
    const error = new Error('later commit failed');
    failNextInsertInto('right', error);

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(container.innerHTML).toBe(stable);
    expect(Array.from(container.querySelector('#left')!.childNodes)).toEqual(
      leftNodes
    );
    expect(Array.from(container.querySelector('#right')!.childNodes)).toEqual(
      rightNodes
    );
  });

  it('should restore an earlier attribute when a later attribute write fails', () => {
    const App = () => {
      flip = state(false);
      return (
        <div>
          <button id="first" data-mode={flip() ? 'new' : 'old'}>
            first
          </button>
          <button id="second" data-mode={flip() ? 'new' : 'old'}>
            second
          </button>
        </div>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const second = container.querySelector('#second')!;
    const write = second.setAttribute.bind(second);
    const error = new Error('attribute write failed');
    let armed = true;
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (armed && name === 'data-mode') {
        armed = false;
        throw error;
      }
      write(name, value);
    });

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(container.innerHTML).toBe(stable);
  });

  it.each(['input', 'textarea'] as const)(
    'should restore live %s values when a later value attribute write fails',
    (Tag) => {
      const App = () => {
        flip = state(false);
        return (
          <div>
            <Tag id="first" value={flip() ? 'new' : 'old'} />
            <Tag id="second" value={flip() ? 'new' : 'old'} />
          </div>
        );
      };
      createIsland({ root: container, component: App });
      flushScheduler();
      const stable = container.innerHTML;
      const first = container.querySelector<HTMLInputElement>('#first')!;
      const second = container.querySelector<HTMLInputElement>('#second')!;
      const write = second.setAttribute.bind(second);
      const error = new Error('value attribute write failed');
      let armed = true;
      vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
        if (armed && name === 'value') {
          armed = false;
          throw error;
        }
        write(name, value);
      });

      flip.set(true);
      expect(() => flushScheduler()).toThrow(error);
      expect(container.innerHTML).toBe(stable);
      expect(first.value).toBe('old');
      expect(second.value).toBe('old');
    }
  );

  it('should restore live checkbox state when a later checked attribute write fails', () => {
    const App = () => {
      flip = state(false);
      return (
        <div>
          <input id="first" type="checkbox" checked={flip()} />
          <input id="second" type="checkbox" checked={flip()} />
        </div>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const first = container.querySelector<HTMLInputElement>('#first')!;
    const second = container.querySelector<HTMLInputElement>('#second')!;
    const write = second.setAttribute.bind(second);
    const error = new Error('checked attribute write failed');
    let armed = true;
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (armed && name === 'checked') {
        armed = false;
        throw error;
      }
      write(name, value);
    });

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(container.innerHTML).toBe(stable);
    expect(first.checked).toBe(false);
    expect(second.checked).toBe(false);
  });

  it('should restore live option state when a later selected attribute write fails', () => {
    const App = () => {
      flip = state(false);
      return (
        <select multiple>
          <option id="first" selected={flip()}>
            First
          </option>
          <option id="second" selected={flip()}>
            Second
          </option>
        </select>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const first = container.querySelector<HTMLOptionElement>('#first')!;
    const second = container.querySelector<HTMLOptionElement>('#second')!;
    const write = second.setAttribute.bind(second);
    const error = new Error('selected attribute write failed');
    let armed = true;
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (armed && name === 'selected') {
        armed = false;
        throw error;
      }
      write(name, value);
    });

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(container.innerHTML).toBe(stable);
    expect(first.selected).toBe(false);
    expect(second.selected).toBe(false);
  });

  it('should preserve single-select choice when an option selected write fails', () => {
    const App = () => {
      flip = state(false);
      return (
        <select>
          <option id="first" selected>
            First
          </option>
          <option id="second" selected={flip()}>
            Second
          </option>
        </select>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const first = container.querySelector<HTMLOptionElement>('#first')!;
    const second = container.querySelector<HTMLOptionElement>('#second')!;
    const write = second.setAttribute.bind(second);
    const error = new Error('selected attribute write failed');
    let armed = true;
    vi.spyOn(second, 'setAttribute').mockImplementation((name, value) => {
      if (armed && name === 'selected') {
        armed = false;
        throw error;
      }
      write(name, value);
    });

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(container.innerHTML).toBe(stable);
    expect(first.selected).toBe(true);
    expect(second.selected).toBe(false);
  });
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

    it('should roll back a reactive child commit error in the second row', () => {
      let items!: State<string[] | null>;
      // Both rows switch from text to keyed children through a function child.
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
