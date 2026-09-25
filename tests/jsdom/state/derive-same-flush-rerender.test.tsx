import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { derive, selector, state } from '../../../src/index';
import { For } from '../../../src/control';
import { task, watch } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

// Regression coverage for #428: a component that re-renders twice inside one
// runtime flush must not serve a derive() value computed from the previous
// render's closure over non-reactive render locals.
describe('derive() across same-flush re-renders (#428)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it('should recompute render-local closures when watch() re-renders in the same flush', () => {
    let setS!: (value: number) => void;

    function C() {
      const [s, set] = state(1);
      setS = set;
      const local = s() * 10;
      const d = derive(() => local + 1);
      watch(s, (v) => {
        if (v === 2) set(3);
      });
      return (
        <p>
          {s()}:{d()}
        </p>
      );
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('1:11');

    setS(2);
    flushScheduler();
    expect(container.textContent).toBe('3:31');
  });

  it('should not keep a derived-pass value computed from the previous closure', () => {
    let setS!: (value: number) => void;

    function C() {
      const [s, set] = state(1);
      setS = set;
      const local = s() * 10;
      const d = derive(() => local + s());
      return <p>{d()}</p>;
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('11');

    setS(2);
    flushScheduler();
    expect(container.textContent).toBe('22');
  });

  it('should recompute render-local closures when task() re-renders in the same flush', () => {
    function C() {
      const [s, set] = state(1);
      const local = s() * 10;
      const d = derive(() => local + 1);
      task(() => {
        set(2);
      });
      return (
        <p>
          {s()}:{d()}
        </p>
      );
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('2:21');
  });

  it('should keep memoizing a stable derive function across same-flush re-renders', () => {
    let computes = 0;
    let setS!: (value: number) => void;
    let other!: () => number;
    const compute = () => {
      computes += 1;
      return other() * 2;
    };

    function C() {
      const [s, set] = state(1);
      const [o] = state(5);
      setS = set;
      other = o;
      const d = derive(compute);
      watch(s, (v) => {
        if (v === 2) set(3);
      });
      return (
        <p>
          {s()}:{d()}
        </p>
      );
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('1:10');
    const beforeUpdate = computes;

    // setS(2) re-renders C, then watch() sets 3 and re-renders C again in the
    // same flush. The stable compute reads an unchanged source, so only the
    // first render of the flush may recompute it.
    setS(2);
    flushScheduler();
    expect(container.textContent).toBe('3:10');
    expect(computes).toBe(beforeUpdate + 1);
  });

  // Audit guard (#428 asks to check selector() for the same pattern): selector()
  // already rebinds and recomputes when its source identity changes.
  it('should not serve a stale selector() when a render-local source changes in the same flush', () => {
    let setS!: (value: number) => void;

    function C() {
      const [s, set] = state(1);
      setS = set;
      const local = s() * 10;
      const isSelected = selector(() => local);
      watch(s, (v) => {
        if (v === 2) set(3);
      });
      return (
        <p>
          {s()}:{isSelected(30) ? 'yes' : 'no'}
        </p>
      );
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('1:no');

    setS(2);
    flushScheduler();
    expect(container.textContent).toBe('3:yes');
  });

  it('should publish a render-time recompute to derived consumers in other components (#431)', () => {
    let setS!: (value: number) => void;

    function Child(props: { d: () => number }) {
      const cd = derive(props.d);
      return <i>{cd()}</i>;
    }

    function Parent() {
      const [s, set] = state(1);
      setS = set;
      const local = s() * 10;
      const d = derive(() => local + s());
      return (
        <div>
          <b>{d()}</b>
          <Child d={d} />
        </div>
      );
    }

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.textContent).toBe('1111');

    setS(2);
    flushScheduler();
    expect(container.querySelector('b')?.textContent).toBe('22');
    expect(container.querySelector('i')?.textContent).toBe('22');

    setS(3);
    flushScheduler();
    expect(container.querySelector('b')?.textContent).toBe('33');
    expect(container.querySelector('i')?.textContent).toBe('33');
  });

  it('should recompute a closure over a changed prop when its source also changed', () => {
    let setQuery!: (value: string) => void;
    let setItems!: (value: string[]) => void;

    function List(props: { query: string; items: () => string[] }) {
      const visible = derive(() =>
        props.items().filter((item) => item.includes(props.query))
      );
      return <ul>{visible().join(',')}</ul>;
    }

    function App() {
      const [query, setQ] = state('a');
      const [items, setI] = state(['ab', 'bc']);
      setQuery = setQ;
      setItems = setI;
      return <List query={query()} items={items} />;
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toBe('ab');

    setItems(['ab', 'bc', 'cd']);
    setQuery('c');
    flushScheduler();
    expect(container.textContent).toBe('bc,cd');
  });

  it('should recompute a closure over a local read from another derive, in either write order', () => {
    for (const order of ['a-first', 'b-first'] as const) {
      const island = createTestContainer();
      let setA!: (value: number) => void;
      let setB!: (value: number) => void;

      function C() {
        const [a, sa] = state(1);
        const [b, sb] = state(1);
        setA = sa;
        setB = sb;
        const d1 = derive(() => b() * 100);
        const dbl = d1();
        const d2 = derive(() => a() + dbl);
        return <p>{d2()}</p>;
      }

      try {
        createIsland({ root: island.container, component: C });
        flushScheduler();
        expect(island.container.textContent).toBe('101');

        if (order === 'a-first') {
          setA(2);
          setB(2);
        } else {
          setB(2);
          setA(2);
        }
        flushScheduler();
        expect(island.container.textContent, order).toBe('202');
      } finally {
        island.cleanup();
      }
    }
  });

  it('should recompute a closure over a parent derive captured as a local in a child', () => {
    let setS!: (value: number) => void;
    let setA!: (value: number) => void;

    function Child(props: { d: () => number }) {
      const [a, sa] = state(1);
      setA = sa;
      const v = props.d();
      const cd = derive(() => a() + v);
      return <i>{cd()}</i>;
    }

    function Parent() {
      const [s, ss] = state(1);
      setS = ss;
      const d = derive(() => s() * 100);
      return <Child d={d} />;
    }

    createIsland({ root: container, component: Parent });
    flushScheduler();
    expect(container.textContent).toBe('101');

    setA(2);
    setS(2);
    flushScheduler();
    expect(container.textContent).toBe('202');
  });

  it('should publish a render-time selector() recompute for rows that do not re-render (#431)', () => {
    let setS!: (value: number) => void;

    function App() {
      const [s, set] = state(1);
      setS = set;
      const local = s();
      const isSelected = selector(() => local);
      return (
        <section>
          <For each={() => [1, 2, 3]} by={(item) => item}>
            {(item) => (
              <div data-id={item} class={() => (isSelected(item) ? 'on' : '')}>
                {item}
              </div>
            )}
          </For>
        </section>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    const selected = () =>
      Array.from(container.querySelectorAll('.on')).map((el) =>
        el.getAttribute('data-id')
      );
    expect(selected()).toEqual(['1']);

    setS(2);
    flushScheduler();
    expect(selected()).toEqual(['2']);
  });
});

// Evaluation counts are the performance contract for derive(): memoization
// must survive the fix above for the common declare-and-read patterns.
describe('derive() evaluation counts', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it('should evaluate a derive once per change when the owner also reads its source', () => {
    let count!: ReturnType<typeof state<number>>;
    let evaluations = 0;

    function C() {
      count = state(1);
      const doubled = derive(() => {
        evaluations += 1;
        return count() * 2;
      });
      return (
        <p>
          {count()}:{doubled()}
        </p>
      );
    }

    createIsland({ root: container, component: C });
    flushScheduler();
    expect(container.textContent).toBe('1:2');

    evaluations = 0;
    count.set(2);
    flushScheduler();
    expect(container.textContent).toBe('2:4');
    expect(evaluations).toBe(1);
  });

  it('should bound same-component chain evaluations per change', () => {
    let count!: ReturnType<typeof state<number>>;
    const evaluations = { a: 0, b: 0, c: 0 };

    function Chain({ readSource }: { readSource: boolean }) {
      count = state(1);
      const a = derive(() => {
        evaluations.a += 1;
        return count() + 1;
      });
      const b = derive(() => {
        evaluations.b += 1;
        return a() * 2;
      });
      const c = derive(() => {
        evaluations.c += 1;
        return b() + 1;
      });
      return (
        <p>
          {readSource ? count() : ''}:{c()}
        </p>
      );
    }

    for (const readSource of [false, true]) {
      const App = () => <Chain readSource={readSource} />;
      const island = createTestContainer();
      try {
        createIsland({ root: island.container, component: App });
        flushScheduler();
        expect(island.container.textContent).toBe(`${readSource ? '1' : ''}:5`);

        evaluations.a = evaluations.b = evaluations.c = 0;
        count.set(2);
        flushScheduler();
        expect(island.container.textContent).toBe(`${readSource ? '2' : ''}:7`);
        // Sound-evaluation cost (#428): when the owner does not read the
        // source, the derived lane evaluates `a` eagerly with the previous
        // render's closure to learn whether the owner must re-render. It
        // changed, so the owner re-renders and evaluates its new closure
        // once more. When the owner reads the source it is already queued,
        // so the render is the only evaluation.
        expect(evaluations).toEqual(
          readSource ? { a: 1, b: 1, c: 1 } : { a: 2, b: 1, c: 1 }
        );
      } finally {
        island.cleanup();
      }
    }
  });

  it('should not re-render the owner while a scroll-threshold derive is unchanged', () => {
    let setY!: (value: number) => void;
    let renders = 0;
    let evaluations = 0;

    function Header() {
      renders += 1;
      const [y, set] = state(0);
      setY = set;
      const pastFold = derive(() => {
        evaluations += 1;
        return y() > 500;
      });
      return <header>{pastFold() ? 'compact' : 'full'}</header>;
    }

    createIsland({ root: container, component: Header });
    flushScheduler();
    expect(container.textContent).toBe('full');

    renders = 0;
    evaluations = 0;
    for (let y = 5; y <= 500; y += 5) {
      setY(y);
      flushScheduler();
    }
    expect(container.textContent).toBe('full');
    expect(renders).toBe(0);
    expect(evaluations).toBe(100);

    // Crossing the threshold re-renders once; the owner's new closure is
    // evaluated once more on that render.
    setY(505);
    flushScheduler();
    expect(container.textContent).toBe('compact');
    expect(renders).toBe(1);
    expect(evaluations).toBe(102);
  });
});
