import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  derive,
  selector,
  state,
  Case,
  For,
  Match,
  Show,
  type Derived,
} from '../../../src/index';
import {
  DefaultPortal,
  Portal,
} from '../../../src/foundations/structures/portal';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

// Regression coverage for #523: a derive() owned by a component whose
// ancestor is queued to re-render must not be evaluated with the owner's
// stale props before that ancestor decides whether the owner survives.
describe('derive() owned by a component an ancestor is about to remove (#523)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  type Item = { name: string };

  it('should not evaluate a removed row derive with its stale props', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];
    let evaluations = 0;

    function Row(props: { index: number }) {
      const name = derive(() => {
        evaluations += 1;
        return items()[props.index].name;
      });
      return <li>{name()}</li>;
    }

    function List() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <ul>
          {it().map((_, i) => (
            <Row key={i} index={i} />
          ))}
        </ul>
      );
    }

    createIsland({ root: container, component: List });
    flushScheduler();
    expect(container.textContent).toBe('ab');

    evaluations = 0;
    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('c');
    // The surviving row re-renders with its new closure; the removed row's
    // derive is never evaluated.
    expect(evaluations).toBe(1);
  });

  it('should not evaluate a removed row derive that is only passed to a child', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Label(props: { name: Derived<string> }) {
      return <span>{props.name()}</span>;
    }

    function Row(props: { index: number }) {
      const name = derive(() => items()[props.index].name);
      return (
        <li>
          <Label name={name} />
        </li>
      );
    }

    function List() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <ul>
          {it().map((_, i) => (
            <Row key={i} index={i} />
          ))}
        </ul>
      );
    }

    createIsland({ root: container, component: List });
    flushScheduler();
    expect(container.textContent).toBe('ab');

    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('c');
  });

  it('should still settle a deferred derive when the ancestor render does not reach its owner', () => {
    let setName!: (v: string) => void;
    let setTick!: (v: number) => void;
    let name!: () => string;

    function Leaf() {
      const upper = derive(() => name().toUpperCase());
      return <b>{upper()}</b>;
    }

    function Box(props: { children?: unknown }) {
      const [tick, st] = state(0);
      setTick = st;
      if (tick() === 1) throw new Error('boom');
      return (
        <p>
          {tick()}
          {props.children}
        </p>
      );
    }

    function App() {
      const [n, sn] = state('a');
      name = n;
      setName = sn;
      return (
        <Box>
          <Leaf />
        </Box>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toBe('0A');

    // Leaf's derive waits for Box's queued render. That render fails and
    // leaves Leaf mounted without re-rendering it, so the deferred derive
    // must still be evaluated afterwards in the same flush.
    setTick(1);
    setName('b');
    expect(() => flushScheduler()).toThrow('boom');
    expect(container.textContent).toBe('0B');
  });

  it('should not evaluate a removed row derive rendered through a portal', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Row(props: { index: number }) {
      const name = derive(() => items()[props.index].name);
      return <li>{name()}</li>;
    }

    function Writer() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <Portal>
          <ul>
            {it().map((_, i) => (
              <Row key={i} index={i} />
            ))}
          </ul>
        </Portal>
      );
    }

    const App = () => (
      <>
        <DefaultPortal />
        <Writer />
      </>
    );

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toBe('ab');

    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('c');
  });

  it('should not evaluate a removed row selector() source with its stale props', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Row(props: { index: number }) {
      const isA = selector(() => items()[props.index].name);
      return <li>{isA('a') ? 'A' : 'x'}</li>;
    }

    function List() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <ul>
          {it().map((_, i) => (
            <Row key={i} index={i} />
          ))}
        </ul>
      );
    }

    createIsland({ root: container, component: List });
    flushScheduler();
    expect(container.textContent).toBe('Ax');

    setItems([{ name: 'b' }]);
    flushScheduler();
    expect(container.textContent).toBe('x');
  });

  it('should not evaluate a derive in a <For> row the reconciliation removes', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Row(props: { index: number }) {
      const name = derive(() => items()[props.index].name);
      return <li>{name()}</li>;
    }

    function List() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <ul>
          <For each={() => items()} by={(_, i) => i}>
            {(_, i) => <Row index={i()} />}
          </For>
        </ul>
      );
    }

    createIsland({ root: container, component: List });
    flushScheduler();
    expect(container.textContent).toBe('ab');

    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('c');
  });

  it('should not evaluate a derive in a <Show> branch the control removes', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Second() {
      const name = derive(() => items()[1].name);
      return <b>{name()}</b>;
    }

    function App() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <p>
          <Show when={() => items().length > 1}>
            <Second />
          </Show>
        </p>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toBe('b');

    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('');
  });

  it('should not evaluate a derive in a <Case> branch the control removes', () => {
    let setItems!: (v: Item[]) => void;
    let items!: () => Item[];

    function Second() {
      const name = derive(() => items()[1].name);
      return <b>{name()}</b>;
    }

    function App() {
      const [it, si] = state<Item[]>([{ name: 'a' }, { name: 'b' }]);
      items = it;
      setItems = si;
      return (
        <p>
          <Case fallback={<i>one</i>}>
            <Match when={it().length > 1} key={'many'}>
              <Second />
            </Match>
          </Case>
        </p>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();
    expect(container.textContent).toBe('b');

    setItems([{ name: 'c' }]);
    flushScheduler();
    expect(container.textContent).toBe('one');
  });
});
