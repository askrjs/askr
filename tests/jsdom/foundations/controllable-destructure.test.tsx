import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state } from '../../../src/index';
import { controllableState } from '../../../src/foundations/state';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('controllableState tuple', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should destructure into a getter and setter like state()', () => {
    let setCount!: (next: number) => void;
    const changes: number[] = [];
    createIsland({
      root: container,
      component: () => {
        const [count, set] = controllableState({
          value: undefined,
          defaultValue: 1,
          onChange: (next: number) => changes.push(next),
        });
        setCount = set;
        return <output>{count()}</output>;
      },
    });
    flushScheduler();
    expect(container.textContent).toBe('1');

    setCount(2);
    flushScheduler();
    expect(container.textContent).toBe('2');
    expect(changes).toEqual([2]);
  });

  it('should run an updater once and report the stored value', () => {
    let setCount!: (next: (prev: number) => number) => void;
    const changes: number[] = [];
    let calls = 0;
    createIsland({
      root: container,
      component: () => {
        const [count, set] = controllableState({
          value: undefined,
          defaultValue: 1,
          onChange: (next: number) => changes.push(next),
        });
        setCount = set as never;
        return <output>{count()}</output>;
      },
    });
    flushScheduler();

    setCount((prev) => {
      calls++;
      return prev + 10;
    });
    flushScheduler();
    expect(calls).toBe(1);
    expect(changes).toEqual([11]);
    expect(container.textContent).toBe('11');
  });

  it('should report changes without storing them in controlled mode', () => {
    let setValue!: (next: string) => void;
    const changes: string[] = [];
    createIsland({
      root: container,
      component: () => {
        const [value, set] = controllableState({
          value: 'fixed',
          defaultValue: 'unused',
          onChange: (next: string) => changes.push(next),
        });
        setValue = set;
        return <output>{value()}</output>;
      },
    });
    flushScheduler();

    setValue('next');
    flushScheduler();
    expect(changes).toEqual(['next']);
    expect(container.textContent).toBe('fixed');
  });

  it('should render when passed as a readable function child', () => {
    let setCount!: (next: number) => void;
    createIsland({
      root: container,
      component: () => {
        const count = controllableState({ value: undefined, defaultValue: 3 });
        setCount = count.set;
        return <p>{() => count}</p>;
      },
    });
    flushScheduler();
    expect(container.textContent).toBe('3');

    setCount(4);
    flushScheduler();
    expect(container.textContent).toBe('4');
  });

  it('should store a function value rather than calling it', () => {
    const handler = () => 'handled';
    let calls = 0;
    const counted = () => {
      calls++;
      return handler();
    };
    let current!: () => () => string;
    let setValue!: (next: (prev: () => string) => () => string) => void;
    createIsland({
      root: container,
      component: () => {
        const [value, set] = controllableState<() => string>({
          value: undefined,
          defaultValue: () => 'default',
        });
        current = value;
        setValue = set as never;
        return <output>{value()()}</output>;
      },
    });
    flushScheduler();

    setValue(() => counted);
    flushScheduler();
    expect(calls).toBe(1);
    expect(current()).toBe(counted);
    expect(container.textContent).toBe('handled');
  });

  it('should render the latest controlled value through a readable function child', () => {
    let external!: ReturnType<typeof state<string>>;
    function Field(props: { value: string }) {
      const count = controllableState({
        value: props.value,
        defaultValue: 'unused',
      });
      return <p>{() => count}</p>;
    }
    createIsland({
      root: container,
      component: () => {
        external = state('first');
        return <Field value={external()} />;
      },
    });
    flushScheduler();
    expect(container.textContent).toBe('first');

    external.set('second');
    flushScheduler();
    expect(container.textContent).toBe('second');
  });
});
