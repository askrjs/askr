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
import { createRoot } from '../../../src/core/dom/root';
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
  let unrelated!: State<number>;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('should restore a radio group when changing a checked radio name is rolled back', () => {
    const root = createRoot(container);
    const view = (name: string, title: string) => (
      <div>
        <input id="moving" type="radio" name={name} checked />
        <input id="peer" type="radio" name="target" />
        <span title={title} />
      </div>
    );
    root.render(view('source', 'old'));
    const moving = container.querySelector<HTMLInputElement>('#moving')!;
    const peer = container.querySelector<HTMLInputElement>('#peer')!;
    const later = container.querySelector('span')!;
    peer.checked = true;
    const failure = new Error('later write failed');
    const setAttribute = later.setAttribute.bind(later);
    vi.spyOn(later, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'title' && value === 'new') throw failure;
      setAttribute(name, value);
    });
    expect(() => root.render(view('target', 'new'))).toThrow(failure);
    expect(moving.name).toBe('source');
    expect(moving.checked).toBe(true);
    expect(peer.checked).toBe(true);
    root.dispose();
  });

  it('should restore a radio peer when changing a checked input type is rolled back', () => {
    const root = createRoot(container);
    const view = (type: string, title: string) => (
      <div>
        <input id="moving" type={type} name="target" checked />
        <input id="peer" type="radio" name="target" />
        <span title={title} />
      </div>
    );
    root.render(view('checkbox', 'old'));
    const moving = container.querySelector<HTMLInputElement>('#moving')!;
    const peer = container.querySelector<HTMLInputElement>('#peer')!;
    const later = container.querySelector('span')!;
    peer.checked = true;
    const failure = new Error('later write failed');
    const setAttribute = later.setAttribute.bind(later);
    vi.spyOn(later, 'setAttribute').mockImplementation((name, value) => {
      if (name === 'title' && value === 'new') throw failure;
      setAttribute(name, value);
    });
    expect(() => root.render(view('radio', 'new'))).toThrow(failure);
    expect(moving.type).toBe('checkbox');
    expect(moving.checked).toBe(true);
    expect(peer.checked).toBe(true);
    root.dispose();
  });

  it('should restore the previous tree when a new textarea default value write fails', () => {
    const root = createRoot(container);
    root.render(<p>previous</p>);
    const previous = container.firstChild;
    const error = new Error('textarea default value failed');
    const descriptor = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'defaultValue'
    )!;
    vi.spyOn(
      HTMLTextAreaElement.prototype,
      'defaultValue',
      'set'
    ).mockImplementation(function (this: HTMLTextAreaElement, value: string) {
      descriptor.set!.call(this, value);
      throw error;
    });

    expect(() => root.render(<textarea value="next" />)).toThrow(error);
    expect(container.firstChild).toBe(previous);
    expect(container.textContent).toBe('previous');
    root.dispose();
  });

  it('should roll back earlier writes when an attribute snapshot throws', () => {
    const root = createRoot(container);
    root.render(
      <>
        <p>previous</p>
        <button data-mode="previous" />
      </>
    );
    const button = container.querySelector('button')!;
    const read = button.getAttribute.bind(button);
    const error = new Error('attribute snapshot failed');
    vi.spyOn(button, 'getAttribute').mockImplementation((name) => {
      if (name === 'data-mode') throw error;
      return read(name);
    });

    expect(() =>
      root.render(
        <>
          <p>next</p>
          <button data-mode="next" />
        </>
      )
    ).toThrow(error);
    expect(container.querySelector('p')?.textContent).toBe('previous');
    vi.restoreAllMocks();
    expect(button.getAttribute('data-mode')).toBe('previous');
    root.dispose();
  });

  it('should roll back earlier writes when a select snapshot throws', () => {
    const root = createRoot(container);
    root.render(
      <>
        <p>previous</p>
        <select value="a">
          <option value="a">A</option>
          <option value="b">B</option>
        </select>
      </>
    );
    const select = container.querySelector('select')!;
    const error = new Error('select snapshot failed');
    const read = vi
      .spyOn(select, 'selectedIndex', 'get')
      .mockImplementation(() => {
        throw error;
      });

    expect(() =>
      root.render(
        <>
          <p>next</p>
          <select value="b">
            <option value="a">A</option>
            <option value="b">B</option>
          </select>
        </>
      )
    ).toThrow(error);
    expect(container.querySelector('p')?.textContent).toBe('previous');
    read.mockRestore();
    expect(select.value).toBe('a');
    root.dispose();
  });

  it('should roll back earlier writes when an input snapshot throws', () => {
    const root = createRoot(container);
    root.render(
      <>
        <p>previous</p>
        <input value="previous" />
      </>
    );
    const input = container.querySelector('input')!;
    const error = new Error('input snapshot failed');
    const read = vi.spyOn(input, 'value', 'get').mockImplementation(() => {
      throw error;
    });

    expect(() =>
      root.render(
        <>
          <p>next</p>
          <input value="next" />
        </>
      )
    ).toThrow(error);
    expect(container.querySelector('p')?.textContent).toBe('previous');
    read.mockRestore();
    expect(input.value).toBe('previous');
    root.dispose();
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

  it('should restore an earlier text patch when a later insertion fails', () => {
    const App = () => {
      flip = state(false);
      const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      return (
        <div>
          <p id="label">{flip() ? 'new' : 'old'}</p>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const error = new Error('later insertion failed');
    failNextInsertInto('list', error);

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(container.innerHTML).toBe(stable);
    expect(container.querySelector('#label')?.textContent).toBe('old');

    flip.set(false);
    flushScheduler();
    flip.set(true);
    flushScheduler();

    expect(container.querySelector('#label')?.textContent).toBe('new');
    expect(
      Array.from(
        container.querySelectorAll('#list li'),
        (item) => item.textContent
      )
    ).toEqual(['b', 'a', 'c']);
  });

  it('should retry an imperative child transition after a later commit failure', () => {
    const App = () => {
      flip = state(false);
      unrelated = state(0);
      const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      return (
        <div>
          <section id="host" imperativeChildren={flip()}>
            {flip() ? null : <b>managed</b>}
          </section>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
          <span>{unrelated()}</span>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const error = new Error('later insertion failed');
    failNextInsertInto('list', error);

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);
    expect(container.querySelector('#host')?.textContent).toBe('managed');

    unrelated.set(1);
    flushScheduler();

    expect(container.querySelector('#host')?.textContent).toBe('');
    expect(
      Array.from(
        container.querySelectorAll('#list li'),
        (item) => item.textContent
      )
    ).toEqual(['b', 'a', 'c']);
  });

  it('should restore an earlier event handler when a later insertion fails', () => {
    const previousHandler = vi.fn();
    const nextHandler = vi.fn();
    const App = () => {
      flip = state(false);
      const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      return (
        <div>
          <button id="action" onClick={flip() ? nextHandler : previousHandler}>
            action
          </button>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const error = new Error('later insertion failed');
    failNextInsertInto('list', error);

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    container
      .querySelector('#action')!
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(previousHandler).toHaveBeenCalledTimes(1);
    expect(nextHandler).not.toHaveBeenCalled();
  });

  it('should restore fallback and namespaced attributes after a later failure', () => {
    const App = () => {
      flip = state(false);
      const keys = flip() ? ['b', 'a', 'c'] : ['a', 'b'];
      return (
        <div>
          <x-widget id="widget" {...{ 'attr:mode': flip() ? 'new' : 'old' }} />
          <svg>
            <use xlinkHref={flip() ? '#new' : '#old'} />
          </svg>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const widget = container.querySelector('x-widget')!;
    const use = container.querySelector('use')!;
    const error = new Error('later insertion failed');
    failNextInsertInto('list', error);

    expect(() => {
      flip.set(true);
      flushScheduler();
    }).toThrow(error);

    expect(widget.getAttribute('mode')).toBe('old');
    expect(use.getAttributeNS('http://www.w3.org/1999/xlink', 'href')).toBe(
      '#old'
    );
    expect(use.getAttribute('xlink:href')).toBe('#old');
    expect(use.getAttributeNode('xlink:href')?.namespaceURI).toBe(
      'http://www.w3.org/1999/xlink'
    );
  });

  it('should retain a function child when its hook remount is rolled back', () => {
    const App = () => {
      flip = state(true);
      const keys = flip() ? ['a', 'b'] : ['b', 'a', 'c'];
      return (
        <div>
          <p id="dynamic">
            {() => {
              const [value] = state('old');
              if (flip()) return <b>{value()}</b>;
              value();
              const [next] = state('new');
              return <b>{next()}</b>;
            }}
          </p>
          <ul id="list">
            {keys.map((key) => (
              <li key={key}>{key}</li>
            ))}
          </ul>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const stable = container.innerHTML;
    const error = new Error('later insertion failed');
    failNextInsertInto('list', error);

    expect(() => {
      flip.set(false);
      flushScheduler();
    }).toThrow(error);

    expect(container.innerHTML).toBe(stable);
  });

  it('should undo a function child replacement that mutates then throws', () => {
    const App = () => {
      flip = state(true);
      return (
        <p id="dynamic">
          {() => {
            const [value] = state('old');
            if (flip()) return <b>{value()}</b>;
            value();
            const [next] = state('new');
            return <b>{next()}</b>;
          }}
        </p>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    const dynamic = container.querySelector('#dynamic')!;
    const previous = dynamic.firstChild;
    const insertBefore = dynamic.insertBefore.bind(dynamic);
    const error = new Error('replacement insertion failed after mutation');
    let shouldFail = true;
    vi.spyOn(dynamic, 'insertBefore').mockImplementation((node, before) => {
      const inserted = insertBefore(node, before);
      if (shouldFail) {
        shouldFail = false;
        throw error;
      }
      return inserted;
    });

    expect(() => {
      flip.set(false);
      flushScheduler();
    }).toThrow(error);

    expect(dynamic.firstChild).toBe(previous);
    expect(dynamic.textContent).toBe('old');

    flip.set(true);
    flushScheduler();
    flip.set(false);
    flushScheduler();
    expect(dynamic.textContent).toBe('new');
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

  it('should restore an uncontrolled radio peer when a later write aborts the commit', () => {
    const App = () => {
      flip = state(false);
      return (
        <div>
          <input id="peer" type="radio" name="choice" />
          <input id="controlled" type="radio" name="choice" checked={flip()} />
          <form>
            <input id="other-form" type="radio" name="choice" />
          </form>
          <span title={flip() ? 'new' : 'old'} />
        </div>
      );
    };
    createIsland({ root: container, component: App });
    flushScheduler();
    const peer = container.querySelector<HTMLInputElement>('#peer')!;
    const controlled =
      container.querySelector<HTMLInputElement>('#controlled')!;
    const otherForm = container.querySelector<HTMLInputElement>('#other-form')!;
    const later = container.querySelector('span')!;
    peer.checked = true;
    otherForm.checked = true;
    const write = later.setAttribute.bind(later);
    const error = new Error('later title write failed');
    let armed = true;
    vi.spyOn(later, 'setAttribute').mockImplementation((name, value) => {
      if (armed && name === 'title') {
        armed = false;
        throw error;
      }
      write(name, value);
    });

    flip.set(true);
    expect(() => flushScheduler()).toThrow(error);
    expect(controlled.checked).toBe(false);
    expect(peer.checked).toBe(true);
    expect(otherForm.checked).toBe(true);
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
