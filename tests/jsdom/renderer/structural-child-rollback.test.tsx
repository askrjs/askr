import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { For, Show, state, type State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

function Guard({ value, ok }: { value: number; ok: boolean }) {
  if (value === 2 && !ok) throw new Error('boom');
  return <span>{value}</span>;
}

function items(count: number) {
  return Array.from({ length: count }, (_, index) => <li>{index}</li>);
}

function itemCount(container: HTMLElement): number {
  return container.querySelectorAll('li').length;
}

// A structural function child renders a list whose length follows `n`. In a
// component's fragment result it has no element of its own and renders as a
// function-child component; inside an element it is an element binding.
describe('structural reactive children and render transactions (#559)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should keep a fragment function child current when the render rolls back', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    const App = () => {
      n = state(1);
      ok = state(false);
      const value = n();
      return (
        <>
          {() => items(n())}
          <Guard value={value} ok={ok()} />
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(itemCount(container)).toBe(1);

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');

    // The render's output rolled back; the function child shows the state.
    expect(itemCount(container)).toBe(2);
    expect(container.querySelector('span')!.textContent).toBe('1');

    ok.set(true);
    flushScheduler();

    expect(itemCount(container)).toBe(2);
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  it('should keep a fragment function child current after a recovery that does not re-render its parent', () => {
    let n!: State<number>;
    let tick!: State<number>;
    let bad!: State<boolean>;

    // Reads its own state, so it recovers without its parent re-rendering.
    function Fail() {
      bad = state(false);
      if (bad()) throw new Error('boom');
      return <span>ok</span>;
    }

    const App = () => {
      n = state(1);
      tick = state(0);
      return (
        <>
          {() => items(n())}
          <i>{tick()}</i>
          <Fail />
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(itemCount(container)).toBe(1);

    // The function child's own update joins the parent render that fails.
    expect(() => {
      n.set(2);
      tick.set(1);
      bad.set(true);
      flushScheduler();
    }).toThrow();

    expect(itemCount(container)).toBe(2);

    bad.set(false);
    flushScheduler();

    expect(container.querySelector('span')!.textContent).toBe('ok');
    expect(itemCount(container)).toBe(2);
  });

  it('should re-render a child component whose own update joined a render that rolled back', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    function Items() {
      return <ul>{items(n())}</ul>;
    }

    const App = () => {
      n = state(1);
      ok = state(true);
      return (
        <div>
          <Items />
          <Guard value={2} ok={ok()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(itemCount(container)).toBe(1);

    expect(() => {
      ok.set(false);
      n.set(2);
      flushScheduler();
    }).toThrow('boom');

    // The failed render rolled back; `Items` re-rendered on its own.
    expect(itemCount(container)).toBe(2);
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  it('should keep an element structural child current when the render rolls back', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    const App = () => {
      n = state(1);
      ok = state(false);
      const value = n();
      return (
        <div>
          <ul>{() => items(n())}</ul>
          <Guard value={value} ok={ok()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');
    expect(itemCount(container)).toBe(2);

    ok.set(true);
    flushScheduler();
    expect(itemCount(container)).toBe(2);
  });

  it('should update a fragment function child through successful renders', () => {
    let n!: State<number>;
    let tick!: State<number>;
    let runs = 0;

    const App = () => {
      n = state(1);
      tick = state(0);
      return (
        <>
          {() => {
            runs += 1;
            return items(n());
          }}
          <i>{tick()}</i>
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(itemCount(container)).toBe(1);

    runs = 0;
    n.set(3);
    flushScheduler();
    expect(itemCount(container)).toBe(3);
    expect(runs).toBe(1);

    n.set(2);
    tick.set(1);
    flushScheduler();
    expect(itemCount(container)).toBe(2);
    expect(container.querySelector('i')!.textContent).toBe('1');
    expect(
      Array.from(container.querySelectorAll('li')).map((li) => li.textContent)
    ).toEqual(['0', '1']);
  });
});

function flushError(): unknown {
  try {
    flushScheduler();
  } catch (error) {
    return error;
  }
  return null;
}

function errorMessages(error: unknown): string[] {
  const errors =
    error instanceof AggregateError ? error.errors : error ? [error] : [];
  return errors.map((entry) => (entry as Error).message);
}

// A child component's own update can join a parent render. When that render
// rolls back, the child renders again on its own.
describe('child component updates and render transactions (#559)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  function mountCatchUp(wrap: (render: () => unknown) => unknown): {
    n: State<number>;
    ok: State<boolean>;
  } {
    const refs = {} as { n: State<number>; ok: State<boolean> };

    function Items() {
      return <ul>{items(refs.n())}</ul>;
    }

    const App = () => {
      refs.n = state(1);
      refs.ok = state(true);
      return (
        <div>
          {wrap(() => (
            <Items />
          ))}
          <Guard value={2} ok={refs.ok()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    return refs;
  }

  function Wrapper({ render }: { render: () => unknown }) {
    return <section>{render()}</section>;
  }

  const shapes: Record<string, (render: () => unknown) => unknown> = {
    'a wrapper chain': (render) => <Wrapper render={render} />,
    'a For row': (render) => (
      <For each={['row']} by={(item) => item}>
        {() => render()}
      </For>
    ),
    'a Show branch': (render) => <Show when={true}>{render()}</Show>,
  };

  for (const [name, wrap] of Object.entries(shapes)) {
    it(`should re-render a child component inside ${name} after the render rolls back`, () => {
      const { n, ok } = mountCatchUp(wrap);
      expect(itemCount(container)).toBe(1);

      ok.set(false);
      n.set(2);
      expect(errorMessages(flushError())).toEqual(['boom']);

      expect(itemCount(container)).toBe(2);

      ok.set(true);
      flushScheduler();
      expect(itemCount(container)).toBe(2);
    });
  }

  it('should not re-render a child whose superseded update committed', () => {
    let c!: State<number>;
    let p!: State<number>;
    let cRenders = 0;

    function C() {
      c = state(0);
      cRenders += 1;
      return <b>{c()}</b>;
    }

    const App = () => {
      p = state(0);
      return (
        <div>
          <C />
          <i>{p()}</i>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(cRenders).toBe(1);

    c.set(1);
    p.set(1);
    flushScheduler();

    expect(container.querySelector('div')!.innerHTML).toBe('<b>1</b><i>1</i>');
    // Mount, C's own update, and the parent's render of C, as before #559.
    // The parent's render committed, so C's superseded update is not queued
    // again.
    expect(cRenders).toBe(3);
  });

  it('should report a catch-up render failure with the original error', () => {
    // The catch-up render uses C's last committed props (max 1) with its
    // current state (c 5), so it throws: the same errors as when C's own
    // update runs before its parent's.
    function run(order: 'parent-first' | 'child-first'): string[] {
      const { container: root, cleanup: done } = createTestContainer();
      let c!: State<number>;
      let max!: State<number>;

      function C(props: { max: number }) {
        c = state(0);
        if (c() > props.max) throw new Error('c-boom');
        return <b>{c()}</b>;
      }

      function T(props: { v: number }) {
        if (props.v === 5) throw new Error('t-boom');
        return <i>{props.v}</i>;
      }

      const App = () => {
        max = state(1);
        return (
          <div>
            <C max={max()} />
            <T v={max()} />
          </div>
        );
      };

      try {
        createIsland({ root, component: App });
        flushScheduler();
        if (order === 'parent-first') {
          max.set(5);
          c.set(5);
        } else {
          c.set(5);
          max.set(5);
        }
        const error = flushError();
        expect(error).toBeInstanceOf(AggregateError);
        return errorMessages(error);
      } finally {
        done();
      }
    }

    // Both write orders report both errors, in execution order.
    expect(run('parent-first')).toEqual(['t-boom', 'c-boom']);
    expect(run('child-first')).toEqual(['c-boom', 't-boom']);
  });

  it('should stop re-rendering a child that always throws', () => {
    let c!: State<number>;
    let p!: State<number>;
    let cRenders = 0;

    function C() {
      c = state(0);
      cRenders += 1;
      if (c() > 0) throw new Error('c-boom');
      return <b>{c()}</b>;
    }

    const App = () => {
      p = state(0);
      return (
        <div>
          <C />
          <i>{p()}</i>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();
    cRenders = 0;

    c.set(1);
    p.set(1);
    const first = errorMessages(flushError());
    const firstRenders = cRenders;

    // Nothing is left queued.
    expect(flushError()).toBeNull();
    expect(cRenders).toBe(firstRenders);

    p.set(2);
    const second = errorMessages(flushError());
    // The same counts as before #559: C's own update and the parent's render
    // of C each throw once; a later parent render tries C once more.
    expect({ first, firstRenders, second, total: cRenders }).toEqual({
      first: ['c-boom', 'c-boom'],
      firstRenders: 2,
      second: ['c-boom'],
      total: 3,
    });
  });
});
