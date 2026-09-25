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

describe('fine-grained bindings and render transactions', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should roll back binding updates with the render transaction that made them', () => {
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
    const committed = container.innerHTML;

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');

    // Nothing from the failed render is visible, bindings included.
    expect(container.innerHTML).toBe(committed);

    ok.set(true);
    flushScheduler();

    // The next successful render re-applies the bindings from live state.
    const b = container.querySelector('b')!;
    expect(b.textContent).toBe('2');
    expect(b.getAttribute('title')).toBe('t2');
    expect(container.querySelector('span')!.textContent).toBe('2');
  });

  it('should roll back grouped blueprint bindings with the render transaction', () => {
    let n!: State<number>;
    let ok!: State<boolean>;

    // The second instance is instantiated from the first one's blueprint,
    // so its bindings are grouped blueprint bindings.
    function Counter({ read }: { read: () => number }) {
      return (
        <p>
          <b title={() => `t${read()}`}>{() => read()}</b>
        </p>
      );
    }

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
    const committed = container.innerHTML;

    expect(() => {
      n.set(2);
      flushScheduler();
    }).toThrow('boom');
    expect(container.innerHTML).toBe(committed);

    ok.set(true);
    flushScheduler();

    const b = container.querySelectorAll('b')[1]!;
    expect(b.textContent).toBe('2');
    expect(b.getAttribute('title')).toBe('t2');
  });

  it('should commit a binding that re-evaluates on its own as its own update', () => {
    let n!: State<number>;

    // Documented contract: a binding re-evaluating in the reactive lane is not
    // part of its owner's render transaction, so a failed render does not
    // hold it back.
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
