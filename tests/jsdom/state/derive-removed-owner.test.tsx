import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import { derive, state, type Derived } from '../../../src/index';
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
});
