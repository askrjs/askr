import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { derive, selector, state, type State } from '../../../src/index';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { allowFrameworkWarnings } from '../../setup-env';

const DERIVED_WRITE_ERROR =
  /state\.set\(\) cannot be called inside a derive\(\) or selector\(\) computation/;

describe('state.set() inside derived computations', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });
  afterEach(() => cleanup());

  it('should reject a write from a derive() compute during render', () => {
    const Component = () => {
      const [, setOther] = state(0);
      const value = derive(() => {
        setOther(1);
        return 1;
      });
      return <div>{value()}</div>;
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).toThrow(DERIVED_WRITE_ERROR);
  });

  // The owner never reads the computed values during render, so the only
  // recompute after a source change is the eager one in the derived lane,
  // where no component instance is current.
  it('should reject a write from a derive() compute recomputed in the derived lane', () => {
    allowFrameworkWarnings(/Unused state variable detected in Component/);
    let count!: State<number>;
    let other!: State<number>;
    const Component = () => {
      count = state(0);
      other = state(0);
      derive(() => {
        const next = count() * 2;
        if (next > 0) other.set(next);
        return next;
      });
      return <div>static</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    count.set(1);
    expect(() => flushScheduler()).toThrow(DERIVED_WRITE_ERROR);
    expect(other()).toBe(0);
  });

  it('should reject a write from a selector() source recomputed in the derived lane', () => {
    allowFrameworkWarnings(/Unused state variable detected in Component/);
    let selected!: State<number>;
    let other!: State<number>;
    const Component = () => {
      selected = state(1);
      other = state(0);
      selector(() => {
        const next = selected();
        if (next !== 1) other.set(next);
        return next;
      });
      return <div>static</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    selected.set(2);
    expect(() => flushScheduler()).toThrow(DERIVED_WRITE_ERROR);
    expect(other()).toBe(0);
  });

  it('should reject a write from a selector() source during render', () => {
    const Component = () => {
      const [, setOther] = state(0);
      const isSelected = selector(() => {
        setOther(1);
        return 1;
      });
      return <div>{isSelected(1) ? 'yes' : 'no'}</div>;
    };

    expect(() =>
      createIsland({ root: container, component: Component })
    ).toThrow(DERIVED_WRITE_ERROR);
  });
});
