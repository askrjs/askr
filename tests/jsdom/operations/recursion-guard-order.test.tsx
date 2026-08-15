import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createIsland } from '@askrjs/askr/boot';
import {
  derive,
  selector,
  state,
  type Derived,
  type Selector,
  type State,
} from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function expectLaterRecomputesToRejectRecursion(
  source: State<number>,
  message: string
): void {
  source.set(1);
  expect(() => flushScheduler()).toThrow(message);

  source.set(2);
  expect(() => flushScheduler()).toThrow(message);
}

describe('memoized recursion guard ordering', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => {
    cleanup();
  });

  it('should reject derive self-reads on the second and third recompute', () => {
    let source!: State<number>;
    let recursive!: Derived<number>;

    const App = () => {
      source = state(0);
      recursive = derive(() => {
        const value = source();
        if (value > 0) {
          recursive();
        }
        return value;
      });
      return <output>{String(recursive())}</output>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expectLaterRecomputesToRejectRecursion(
      source,
      'derive() cannot read itself recursively'
    );
  });

  it('should reject selector self-reads on the second and third recompute', () => {
    let source!: State<number>;
    let recursive!: Selector<number>;

    const App = () => {
      source = state(0);
      recursive = selector(() => {
        const value = source();
        if (value > 0) {
          recursive(value);
        }
        return value;
      });
      return <output>{String(recursive(0))}</output>;
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expectLaterRecomputesToRejectRecursion(
      source,
      'selector() cannot read itself recursively'
    );
  });
});
