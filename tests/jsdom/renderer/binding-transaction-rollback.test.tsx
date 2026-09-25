import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { state, type State } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';
import { allowFrameworkWarnings } from '../../setup-env';

function Guard({ value, ok }: { value: number; ok: boolean }) {
  if (value === 2 && !ok) throw new Error('boom');
  return <span>{value}</span>;
}

function Fail({ bad }: { bad: boolean }) {
  if (bad) throw new Error('boom');
  return <span>ok</span>;
}

// The second instance is instantiated from the first one's blueprint, so its
// bindings are grouped blueprint bindings.
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
    expect(container.innerHTML).toBe(
      '<div><b title="t2">2</b><i><span>1</span></i></div><!---->'
    );

    ok.set(true);
    flushScheduler();

    const b = container.querySelector('b')!;
    expect(b.textContent).toBe('2');
    expect(b.getAttribute('title')).toBe('t2');
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  it('should keep grouped blueprint bindings current when the render rolls back', () => {
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
    expect(container.innerHTML).toBe(
      '<div><p><b title="t2">2</b></p><p><b title="t2">2</b></p><span>1</span></div><!---->'
    );

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

  it('should keep pending blueprint re-runs when a render in the same flush rolls back', () => {
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
    allowFrameworkWarnings(/update failed/);
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

    broken = true;
    // A function child's error has no ErrorBoundary here, so the update that
    // ran it throws (the blueprint binding's error is logged).
    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('compute failed');

    broken = false;
    tick.set(1);
    flushScheduler();

    // The blueprint instance's grouped binding receives the same function
    // and must re-run it rather than treat it as unchanged.
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
