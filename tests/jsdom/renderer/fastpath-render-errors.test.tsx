import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { For } from '../../../src/control';
import { state, type State } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

// Fast paths must decide eligibility up front and never catch user errors:
// a throwing row renders once per update and its error surfaces once.
describe('renderer fast paths and throwing user render code', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  function mountKeyedList(size: number, reverseOnUpdate: boolean) {
    let tick!: State<number>;
    let failedRenders = 0;

    const Cell = (props: { id: number; tick: number }) => {
      if (props.tick > 0 && props.id === 1) {
        failedRenders++;
        throw new Error('cell boom');
      }
      return <span>{props.id}</span>;
    };

    const App = () => {
      tick = state(0);
      const t = tick();
      const ids = Array.from({ length: size }, (_, i) => i);
      const ordered = t > 0 && reverseOnUpdate ? ids.slice().reverse() : ids;
      return (
        <ul>
          {ordered.map((id) => (
            <li key={id}>
              <Cell id={id} tick={t} />
            </li>
          ))}
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    return {
      update: () => {
        tick.set(1);
        flushScheduler();
      },
      failedRenders: () => failedRenders,
    };
  }

  it('should render a throwing row once when a large keyed list reverses', () => {
    const list = mountKeyedList(100, true);

    expect(list.update).toThrow('cell boom');
    expect(list.failedRenders()).toBe(1);
  });

  it('should render a throwing row once in a positional keyed update', () => {
    const list = mountKeyedList(12, false);

    expect(list.update).toThrow('cell boom');
    expect(list.failedRenders()).toBe(1);
  });

  it('should render a throwing For row once per update', () => {
    let tick!: State<number>;
    let failedRenders = 0;
    const items = Array.from({ length: 100 }, (_, id) => ({ id }));

    const Row = (props: { id: number }) => {
      if (tick() > 0 && props.id === 1) {
        failedRenders++;
        throw new Error('row boom');
      }
      return <li>{props.id}</li>;
    };

    const App = () => {
      tick = state(0);
      return (
        <ul>
          <For each={() => items} by={(item) => item.id}>
            {(item) => <Row id={item.id} />}
          </For>
        </ul>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(() => {
      tick.set(1);
      flushScheduler();
    }).toThrow('row boom');
    expect(failedRenders).toBe(1);
  });
});
