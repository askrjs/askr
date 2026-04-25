import { describe, expect, beforeEach, test } from 'vite-plus/test';
import { createIsland, state } from '../../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  getPerfMetrics,
  resetPerfMetrics,
} from '../../../src/runtime/perf-metrics';
import { allowFrameworkWarnings } from '../../setup-env';

describe('reactive props issues validation', () => {
  beforeEach(() => {
    resetPerfMetrics();
  });

  test('should not recreate reactive prop subscription when function reference stays the same', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const textState = state('initial');
      const stableFunction = () => textState();

      return <div title={stableFunction}>{'test'}</div>;
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div');
    expect(div?.getAttribute('title')).toBe('initial');

    cleanup();
  });

  test('should clean up reactive prop subscriptions immediately when a prop is removed', () => {
    allowFrameworkWarnings(
      /Unused state variable detected in Component at index 1/
    );
    const { container, cleanup } = createTestContainer();

    let externalState1: ReturnType<typeof state<string>>;
    let externalState2: ReturnType<typeof state<string>>;
    let showBothState: ReturnType<typeof state<boolean>>;
    let prop2Evaluations = 0;

    const Component = () => {
      externalState1 = state('value1');
      externalState2 = state('value2');
      showBothState = state(true);

      return (
        <div>
          <span
            data-prop1={() => externalState1()}
            data-prop2={
              showBothState()
                ? () => {
                    prop2Evaluations += 1;
                    return externalState2();
                  }
                : 'static'
            }
          >
            {'test'}
          </span>
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const span = container.querySelector('span');
    expect(span?.getAttribute('data-prop1')).toBe('value1');
    expect(span?.getAttribute('data-prop2')).toBe('value2');

    prop2Evaluations = 0;
    showBothState!.set(false);
    flushScheduler();

    expect(span?.getAttribute('data-prop2')).toBe('static');

    externalState2!.set('value3');
    flushScheduler();

    expect(span?.getAttribute('data-prop2')).toBe('static');
    expect(prop2Evaluations).toBe(0);

    cleanup();
  });

  test('should only reevaluate dirty reactive props', () => {
    const { container, cleanup } = createTestContainer();

    let leftState: ReturnType<typeof state<string>>;
    let rightState: ReturnType<typeof state<string>>;
    let leftEvaluations = 0;
    let rightEvaluations = 0;

    const Component = () => {
      leftState = state('left-1');
      rightState = state('right-1');

      return (
        <div>
          <span
            id="left"
            data-value={() => {
              leftEvaluations += 1;
              return leftState();
            }}
          />
          <span
            id="right"
            data-value={() => {
              rightEvaluations += 1;
              return rightState();
            }}
          />
        </div>
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    leftEvaluations = 0;
    rightEvaluations = 0;

    leftState!.set('left-2');
    flushScheduler();

    expect(container.querySelector('#left')?.getAttribute('data-value')).toBe(
      'left-2'
    );
    expect(container.querySelector('#right')?.getAttribute('data-value')).toBe(
      'right-1'
    );
    expect(leftEvaluations).toBe(1);
    expect(rightEvaluations).toBe(0);
    expect(getPerfMetrics()?.reactivePropReevaluations).toBeGreaterThan(0);

    cleanup();
  });

  test('should skip DOM writes when a reactive prop value is unchanged', () => {
    const { container, cleanup } = createTestContainer();

    let countState: ReturnType<typeof state<number>>;

    const Component = () => {
      countState = state(0);
      return (
        <div
          id="subject"
          data-parity={() => (countState() % 2 === 0 ? 'even' : 'odd')}
        />
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    resetPerfMetrics();
    countState!.set(2);
    flushScheduler();

    expect(
      container.querySelector('#subject')?.getAttribute('data-parity')
    ).toBe('even');
    expect(getPerfMetrics()?.skippedDomPropWrites).toBeGreaterThan(0);

    cleanup();
  });

  test('should preserve stable class tokens when a reactive class toggles', () => {
    const { container, cleanup } = createTestContainer();

    let selectedState: ReturnType<typeof state<boolean>>;

    const Component = () => {
      selectedState = state(false);
      return (
        <div
          id="subject"
          class={() => (selectedState() ? 'row danger' : 'row')}
        />
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const subject = container.querySelector('#subject');
    expect(subject?.className).toBe('row');

    selectedState!.set(true);
    flushScheduler();
    expect(subject?.className).toBe('row danger');

    selectedState!.set(false);
    flushScheduler();
    expect(subject?.className).toBe('row');

    cleanup();
  });
});
