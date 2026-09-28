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

function Fail({ bad }: { bad: boolean }) {
  if (bad) throw new Error('boom');
  return <span>ok</span>;
}

function Counter({ read }: { read: () => number }) {
  return (
    <p>
      <b title={() => `t${read()}`}>{() => read()}</b>
    </p>
  );
}

describe('fine-grained bindings and render transactions', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should keep a binding current when the render that swapped it rolls back', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    const App = () => {
      n = state(1);
      ok = state(false);
      const value = n();
      // Fresh closures each render: the transaction swaps every binding.
      return (
        <div>
          <b title={() => `t${n()}`}>{() => n()}</b>
          <i>
            <Guard value={value} ok={ok()} />
          </i>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');

    // The render's output rolled back; the binding shows committed state.
    expect(container.querySelector('b')?.textContent).toBe('2');
    expect(container.querySelector('b')?.title).toBe('t2');
    expect(container.querySelector('span')?.textContent).toBe('1');

    ok.set(true);
    flushScheduler();

    const b = container.querySelector('b')!;
    expect(b.textContent).toBe('2');
    expect(b.getAttribute('title')).toBe('t2');
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  it('should keep repeated row bindings current when the render rolls back', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    const App = () => {
      n = state(1);
      ok = state(false);
      const value = n();
      return (
        <div>
          <Counter read={() => n()} />
          <Counter read={() => n()} />
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
    expect(
      Array.from(container.querySelectorAll('b')).map((b) => [
        b.textContent,
        b.title,
      ])
    ).toEqual([
      ['2', 't2'],
      ['2', 't2'],
    ]);
    expect(container.querySelector('span')?.textContent).toBe('1');

    ok.set(true);
    flushScheduler();

    for (const b of Array.from(container.querySelectorAll('b'))) {
      expect(b.textContent).toBe('2');
      expect(b.getAttribute('title')).toBe('t2');
    }
  });

  it('should keep a pending binding re-run when a render in the same flush rolls back', () => {
    let n!: State<number>;
    let m!: State<boolean>;

    // The render reads only `m`; `n` reaches the DOM through the binding.
    const App = () => {
      n = state(1);
      m = state(false);
      return (
        <div>
          <b>{() => n()}</b>
          <Fail bad={m()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      n.set(2);
      m.set(true);
      flushScheduler();
    }).toThrow('boom');

    expect(container.querySelector('b')!.textContent).toBe('2');
  });

  it('should keep pending repeated row re-runs when a render in the same flush rolls back', () => {
    let n!: State<number>;
    let m!: State<boolean>;

    const App = () => {
      n = state(1);
      m = state(false);
      return (
        <div>
          <Counter read={() => n()} />
          <Counter read={() => n()} />
          <Fail bad={m()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      n.set(2);
      m.set(true);
      flushScheduler();
    }).toThrow('boom');

    for (const b of Array.from(container.querySelectorAll('b'))) {
      expect(b.textContent).toBe('2');
      expect(b.getAttribute('title')).toBe('t2');
    }
  });

  it('should retry a failed binding compute when a render passes the same function', () => {
    let n!: State<number>;
    let tick!: State<number>;
    let broken = false;
    const read = () => {
      if (broken) throw new Error('compute failed');
      return n();
    };

    function Label(_props: { tick: number }) {
      return (
        <p>
          <b>{read}</b>
        </p>
      );
    }

    const App = () => {
      n = state(1);
      tick = state(0);
      return (
        <div>
          <Label tick={tick()} />
          <Label tick={tick()} />
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    // With no ErrorBoundary, both failed bindings are thrown from the flush.
    broken = true;
    n.set(2);
    expect(() => flushScheduler()).toThrow();

    broken = false;
    tick.set(1);
    flushScheduler();

    // A repeated row receives the same function and must retry the read.
    expect(container.querySelectorAll('b')[1]!.textContent).toBe('2');
  });

  it('should commit a binding that re-evaluates on its own when its render fails', () => {
    let n!: State<number>;

    const App = () => {
      n = state(1);
      const value = n();
      if (value === 2) throw new Error('boom');
      return (
        <div>
          <b>{() => n()}</b>
          <i>{value}</i>
        </div>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');

    expect(container.querySelector('b')!.textContent).toBe('2');
    expect(container.querySelector('i')!.textContent).toBe('1');
  });
});
