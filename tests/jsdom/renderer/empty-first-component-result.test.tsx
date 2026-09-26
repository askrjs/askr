import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vite-plus/test';
import { state } from '../../../src';
import { getRuntimeRenderer } from '../../../src/runtime/access';
import { registerCommitParticipant } from '../../../src/runtime/transactions/access';
import { render } from '../../../src/testing';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { renderToStringSync } from '../../../src/ssr';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

/**
 * A component whose first render is empty keeps a comment placeholder. When it
 * later renders text, a fragment, or a component that renders them, the client
 * must place that content where the server would: directly among its siblings,
 * with no wrapper element. Comments (range anchors) are renderer bookkeeping
 * and do not count as markup.
 */

type Toggle = ReturnType<typeof state<boolean>>;

function markup(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function elementTags(root: Element): string[] {
  return Array.from(root.querySelectorAll('*'), (element) =>
    element.tagName.toLowerCase()
  );
}

/**
 * Mount `render` inside a section with an explicit portal host and a tail
 * sibling, first empty. `empty` and `shown` are the server markup for the same
 * tree with the toggle fixed; they are rendered before the client mount so the
 * server renders do not replace the client's toggle.
 */
function mountToggle(render: (shown: boolean) => unknown) {
  let initial = false;
  let toggle!: Toggle;
  function Toggled() {
    toggle = state(initial);
    return render(toggle());
  }
  function App() {
    return (
      <section>
        <DefaultPortal />
        <Toggled />
        <i data-tail={'true'}>{'tail'}</i>
      </section>
    );
  }
  function server(shown: boolean): string {
    initial = shown;
    _resetDefaultPortal();
    try {
      return markup(renderToStringSync(App));
    } finally {
      initial = false;
      _resetDefaultPortal();
    }
  }

  const empty = server(false);
  const shown = server(true);
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component: App });
  flushScheduler();

  return {
    container,
    cleanup,
    empty,
    shown,
    set(next: boolean) {
      toggle.set(next);
      flushScheduler();
    },
  };
}

describe('component whose first render is empty', () => {
  const cleanups: Array<() => void> = [];

  beforeEach(() => {
    _resetDefaultPortal();
  });

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    _resetDefaultPortal();
  });

  function setup(render: (shown: boolean) => unknown) {
    const mounted = mountToggle(render);
    cleanups.push(mounted.cleanup);
    return mounted;
  }

  it('should render later text without a wrapper element', () => {
    const view = setup((shown) => (shown ? 'hello' : null));
    const section = view.container.querySelector('section')!;
    const tail = section.querySelector('[data-tail]');
    expect(markup(view.container.innerHTML)).toBe(view.empty);

    view.set(true);

    expect(elementTags(section)).toEqual(['i']);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
    expect(markup(section.innerHTML)).toBe('hello<i data-tail="true">tail</i>');
    expect(section.querySelector('[data-tail]')).toBe(tail);
  });

  it('should render later numeric text without a wrapper element', () => {
    const view = setup((shown) => (shown ? 42 : null));

    view.set(true);

    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should render a later multi-node fragment without a wrapper element', () => {
    const view = setup((shown) =>
      shown ? (
        <>
          {'a'}
          <b>{'b'}</b>
          {'c'}
        </>
      ) : null
    );

    view.set(true);

    expect(elementTags(view.container.querySelector('section')!)).toEqual([
      'b',
      'i',
    ]);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should render a later element as the component host', () => {
    const view = setup((shown) => (shown ? <b>{'b'}</b> : null));

    view.set(true);

    const section = view.container.querySelector('section')!;
    expect(elementTags(section)).toEqual(['b', 'i']);
    expect(section.querySelector('b')?.parentElement).toBe(section);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should return to empty and render again without leftover nodes', () => {
    const view = setup((shown) =>
      shown ? (
        <>
          {'x'}
          <b>{'y'}</b>
        </>
      ) : null
    );
    const section = view.container.querySelector('section')!;

    for (let round = 0; round < 2; round += 1) {
      view.set(true);
      expect(markup(view.container.innerHTML)).toBe(view.shown);
      view.set(false);
      expect(markup(view.container.innerHTML)).toBe(view.empty);
      expect(elementTags(section)).toEqual(['i']);
      expect(section.textContent).toBe('tail');
    }
  });

  it('should toggle text between empty and shown without a wrapper element', () => {
    const view = setup((shown) => (shown ? 'hello' : null));
    const section = view.container.querySelector('section')!;

    for (let round = 0; round < 2; round += 1) {
      view.set(true);
      expect(markup(view.container.innerHTML)).toBe(view.shown);
      view.set(false);
      expect(markup(view.container.innerHTML)).toBe(view.empty);
      expect(elementTags(section)).toEqual(['i']);
    }
  });

  it('should render a wrapper fragment of later text without a wrapper element', () => {
    function Wrap(props: { children?: unknown }) {
      return <>{props.children}</>;
    }
    const view = setup((shown) => <Wrap>{shown ? 'w' : null}</Wrap>);
    const section = view.container.querySelector('section')!;
    expect(markup(view.container.innerHTML)).toBe(view.empty);
    expect(elementTags(section)).toEqual(['i']);

    view.set(true);

    expect(elementTags(section)).toEqual(['i']);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should render a nested component that later renders text without a wrapper element', () => {
    function Leaf(props: { on: boolean }) {
      return props.on ? 'leaf' : null;
    }
    const view = setup((shown) => <Leaf on={shown} />);
    const section = view.container.querySelector('section')!;

    for (let round = 0; round < 2; round += 1) {
      view.set(true);
      expect(elementTags(section)).toEqual(['i']);
      expect(markup(view.container.innerHTML)).toBe(view.shown);
      view.set(false);
      expect(markup(view.container.innerHTML)).toBe(view.empty);
    }
  });

  it('should keep a nested component instance while its text changes', () => {
    const cells = new Set<ReturnType<typeof state<number>>>();
    let bump!: () => void;
    function Leaf(props: { on: boolean }) {
      const count = state(0);
      cells.add(count);
      bump = () => count.set(count() + 1);
      const value = count();
      return props.on ? `leaf ${value}` : null;
    }
    const view = setup((shown) => <Leaf on={shown} />);
    const section = view.container.querySelector('section')!;
    // Drop the server renders' cells; only client instances count below.
    const clientCell = Array.from(cells).pop()!;
    cells.clear();
    cells.add(clientCell);

    view.set(true);
    bump();
    flushScheduler();

    expect(markup(section.innerHTML)).toBe(
      'leaf 1<i data-tail="true">tail</i>'
    );
    expect(elementTags(section)).toEqual(['i']);

    view.set(false);
    view.set(true);

    expect(markup(section.innerHTML)).toBe(
      'leaf 1<i data-tail="true">tail</i>'
    );
    expect(cells.size).toBe(1);
  });

  it('should render a Portal string child without a wrapper element', () => {
    const view = setup((shown) => (shown ? <Portal>{'x'}</Portal> : null));

    view.set(true);

    expect(elementTags(view.container.querySelector('section')!)).toEqual([
      'i',
    ]);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should render a Portal function child without a wrapper element', () => {
    const view = setup((shown) =>
      shown ? <Portal>{() => 'x'}</Portal> : null
    );

    view.set(true);

    expect(elementTags(view.container.querySelector('section')!)).toEqual([
      'i',
    ]);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });

  it('should render a Portal multi-node child without a wrapper element', () => {
    const view = setup((shown) =>
      shown ? (
        <Portal>
          {'x'}
          <b>{'y'}</b>
        </Portal>
      ) : null
    );

    view.set(true);

    expect(elementTags(view.container.querySelector('section')!)).toEqual([
      'b',
      'i',
    ]);
    expect(markup(view.container.innerHTML)).toBe(view.shown);
  });
});

describe('component whose first render is text', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
    _resetDefaultPortal();
  });

  it.each([
    ['text', () => 'hello'],
    [
      'a component rendering a fragment',
      () => {
        function Leaf() {
          return (
            <>
              {'a'}
              <b>{'b'}</b>
            </>
          );
        }
        return <Leaf />;
      },
    ],
    [
      'a component rendering text',
      () => {
        function Leaf() {
          return 'leaf';
        }
        return <Leaf />;
      },
    ],
  ])('should match server markup for %s', (_name, render) => {
    _resetDefaultPortal();
    function Content() {
      return render();
    }
    function App() {
      return (
        <section>
          <Content />
          <i>{'tail'}</i>
        </section>
      );
    }
    const server = markup(renderToStringSync(App));
    _resetDefaultPortal();
    const { container, cleanup } = createTestContainer();
    cleanups.push(cleanup);
    createIsland({ root: container, component: App });
    flushScheduler();

    expect(markup(container.innerHTML)).toBe(server);
    expect(container.querySelectorAll('div')).toHaveLength(0);
  });
});

describe('automatic default portal host', () => {
  afterEach(() => {
    _resetDefaultPortal();
  });

  it('should render later Portal text after the root without a wrapper element', () => {
    _resetDefaultPortal();
    let toggle!: Toggle;
    function App() {
      toggle = state(false);
      return (
        <section>
          <Portal>{toggle() ? 'x' : null}</Portal>
          <i>{'tail'}</i>
        </section>
      );
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const section = container.querySelector('section');

      for (let round = 0; round < 2; round += 1) {
        toggle.set(true);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe(
          '<section><i>tail</i></section>x'
        );
        expect(container.querySelectorAll('div')).toHaveLength(0);
        expect(container.querySelector('section')).toBe(section);

        toggle.set(false);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe(
          '<section><i>tail</i></section>'
        );
      }
    } finally {
      cleanup();
    }
  });

  it('should render later multi-node Portal content after the root without a wrapper element', () => {
    _resetDefaultPortal();
    let toggle!: Toggle;
    function App() {
      toggle = state(false);
      return (
        <section>
          <Portal>
            {toggle() ? (
              <>
                {'x'}
                <b>{'y'}</b>
              </>
            ) : null}
          </Portal>
        </section>
      );
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      for (let round = 0; round < 2; round += 1) {
        toggle.set(true);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe(
          '<section></section>x<b>y</b>'
        );
        expect(container.querySelectorAll('div')).toHaveLength(0);

        toggle.set(false);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe('<section></section>');
      }
    } finally {
      cleanup();
    }
  });

  it('should remove later Portal text when its writer unmounts', () => {
    _resetDefaultPortal();
    let toggle!: Toggle;
    function App() {
      toggle = state(false);
      return (
        <section>
          {toggle() ? <Portal>{'x'}</Portal> : null}
          <i>{'tail'}</i>
        </section>
      );
    }
    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();

      for (let round = 0; round < 2; round += 1) {
        toggle.set(true);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe(
          '<section><i>tail</i></section>x'
        );

        toggle.set(false);
        flushScheduler();
        expect(markup(container.innerHTML)).toBe(
          '<section><i>tail</i></section>'
        );
      }
    } finally {
      cleanup();
    }
  });
});

describe('placeholder application when range replacement is declined', () => {
  function mountDeclined(result: () => unknown) {
    let visible!: Toggle;
    function Child() {
      visible = state(false);
      return visible() ? result() : null;
    }
    const view = render(() => (
      <section>
        <Child />
        <i>{'tail'}</i>
      </section>
    ));
    const renderer = getRuntimeRenderer();
    const replacement = vi
      .spyOn(renderer, 'replaceComponentRange')
      .mockReturnValue(null);
    return {
      view,
      show() {
        visible.set(true);
        view.flush();
      },
      restore() {
        replacement.mockRestore();
        view.cleanup();
      },
    };
  }

  it.each([
    ['text', () => 'ready', '<section>ready<i>tail</i></section>'],
    [
      'a multi-node fragment',
      () => (
        <>
          {'a'}
          <b>{'b'}</b>
        </>
      ),
      '<section>a<b>b</b><i>tail</i></section>',
    ],
  ])('should apply %s without a wrapper element', (_name, result, html) => {
    const mounted = mountDeclined(result);
    try {
      mounted.show();
      expect(markup(mounted.view.root.innerHTML)).toBe(html);
      expect(mounted.view.root.querySelectorAll('div')).toHaveLength(0);
    } finally {
      mounted.restore();
    }
  });

  it('should restore the placeholder when publication of a multi-node range fails', () => {
    const mounted = mountDeclined(() => (
      <>
        {'a'}
        <b>{'b'}</b>
      </>
    ));
    const renderer = getRuntimeRenderer();
    const evaluate = renderer.evaluate.bind(renderer);
    const application = vi
      .spyOn(renderer, 'evaluate')
      .mockImplementation((...args) => {
        evaluate(...args);
        registerCommitParticipant({
          publish() {
            throw new Error('extension publication failed');
          },
        });
      });
    const previous = mounted.view.root.innerHTML;
    try {
      expect(() => mounted.show()).toThrow('extension publication failed');
      expect(mounted.view.root.innerHTML).toBe(previous);
    } finally {
      application.mockRestore();
      mounted.restore();
    }
  });

  it('should restore a declined range when a later publication fails', () => {
    let value!: ReturnType<typeof state<string>>;
    function Child() {
      value = state('');
      return value() ? value() : null;
    }
    const view = render(() => (
      <section>
        <Child />
        <i>{'tail'}</i>
      </section>
    ));
    const renderer = getRuntimeRenderer();
    const replacement = vi
      .spyOn(renderer, 'replaceComponentRange')
      .mockReturnValue(null);
    const evaluate = renderer.evaluate.bind(renderer);
    try {
      value.set('one');
      view.flush();
      const previous = view.root.innerHTML;
      const application = vi
        .spyOn(renderer, 'evaluate')
        .mockImplementation((...args) => {
          evaluate(...args);
          registerCommitParticipant({
            publish() {
              throw new Error('extension publication failed');
            },
          });
        });
      try {
        value.set('two');
        expect(() => view.flush()).toThrow('extension publication failed');
      } finally {
        application.mockRestore();
      }
      expect(view.root.innerHTML).toBe(previous);

      value.set('three');
      view.flush();
      expect(markup(view.root.innerHTML)).toBe(
        '<section>three<i>tail</i></section>'
      );
    } finally {
      replacement.mockRestore();
      view.cleanup();
    }
  });

  it('should update and clear the whole range on later declined commits', () => {
    let value!: ReturnType<typeof state<string | null>>;
    function Child() {
      value = state<string | null>(null);
      return value();
    }
    const view = render(() => (
      <section>
        <Child />
        <i>{'tail'}</i>
      </section>
    ));
    const replacement = vi
      .spyOn(getRuntimeRenderer(), 'replaceComponentRange')
      .mockReturnValue(null);
    try {
      for (const next of ['one', 'two', null, 'three', 'four', null]) {
        value.set(next);
        view.flush();
        expect(markup(view.root.innerHTML)).toBe(
          `<section>${next ?? ''}<i>tail</i></section>`
        );
      }
    } finally {
      replacement.mockRestore();
      view.cleanup();
    }
  });

  it('should replace a declined multi-node range with an element', () => {
    let value!: ReturnType<typeof state<number>>;
    function Child() {
      value = state(0);
      const current = value();
      if (current === 1)
        return (
          <>
            {'a'}
            <b>{'b'}</b>
          </>
        );
      if (current === 2) return <em>{'e'}</em>;
      return null;
    }
    const view = render(() => (
      <section>
        <Child />
        <i>{'tail'}</i>
      </section>
    ));
    const replacement = vi
      .spyOn(getRuntimeRenderer(), 'replaceComponentRange')
      .mockReturnValue(null);
    try {
      // An element host keeps extension evaluation inside it afterwards, so
      // the range is replaced once, after being cleared and restored.
      const expected = [
        '<section>a<b>b</b><i>tail</i></section>',
        '<section><i>tail</i></section>',
        '<section>a<b>b</b><i>tail</i></section>',
        '<section><em>e</em><i>tail</i></section>',
      ];
      [1, 0, 1, 2].forEach((next, index) => {
        value.set(next);
        view.flush();
        expect(markup(view.root.innerHTML)).toBe(expected[index]);
        expect(view.root.querySelectorAll('b').length).toBe(next === 1 ? 1 : 0);
      });
    } finally {
      replacement.mockRestore();
      view.cleanup();
    }
  });
});
