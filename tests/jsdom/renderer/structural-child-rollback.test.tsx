import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, type State } from '../../../src/index';
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
