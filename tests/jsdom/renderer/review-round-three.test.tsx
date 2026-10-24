import { describe, it, expect, afterEach } from 'vite-plus/test';
import { state, store, type State } from '../../../src';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('review round three: renderer', () => {
  let cleanup = () => {};
  afterEach(() => cleanup());

  it('should restore indeterminate after the user cleared it when the prop is unchanged', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    let bump!: State<number>;
    createIsland({
      root: mounted.container,
      component: () => {
        const tick = state(0);
        bump = tick;
        return (
          <label data-tick={tick()}>
            <input type="checkbox" indeterminate={true} />
          </label>
        );
      },
    });
    flushScheduler();
    const input = mounted.container.querySelector('input')!;
    expect(input.indeterminate).toBe(true);
    input.indeterminate = false;
    bump.set(1);
    flushScheduler();
    expect(input.indeterminate).toBe(true);
  });

  it('should read frozen nested objects and find raw items in store arrays', () => {
    const mounted = createTestContainer();
    cleanup = mounted.cleanup;
    const raw = { id: 1 };
    let result = '';
    createIsland({
      root: mounted.container,
      component: () => {
        const frozen = store(Object.freeze({ a: Object.freeze({ b: 1 }) }));
        const list = store({ items: [raw] });
        result = `${frozen.a.b}:${list.items.includes(raw)}:${list.items.indexOf(raw)}`;
        return <p>{result}</p>;
      },
    });
    flushScheduler();
    expect(result).toBe('1:true:0');
  });
});
