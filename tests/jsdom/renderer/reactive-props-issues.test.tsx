import { describe, expect, beforeEach, test } from 'vite-plus/test';
import { state } from '../../../src';
import { createIsland } from '@askrjs/askr/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import {
  getPerfMetrics,
  resetPerfMetrics,
} from '../../../src/runtime/perf-metrics';
import { allowFrameworkWarnings } from '../../setup-env';

function resetFineGrainedDiagnostics(): void {
  const ns = (
    globalThis as typeof globalThis & {
      __ASKR__?: Record<string, unknown>;
    }
  ).__ASKR__;

  if (!ns) {
    return;
  }

  ns['componentReruns'] = 0;
  ns['effectRuns'] = 0;
  ns['textNodeWrites'] = 0;
}

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

  test('should update a reactive style prop without rerunning the parent component', () => {
    const { container, cleanup } = createTestContainer();

    let activeState: ReturnType<typeof state<boolean>>;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      activeState = state(false);

      return (
        <div
          id="subject"
          style={() =>
            activeState()
              ? { padding: '2rem', textAlign: 'center' }
              : { padding: '1rem' }
          }
        />
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const subject = container.querySelector('#subject') as HTMLDivElement;
    expect(subject.style.padding).toBe('1rem');
    expect(subject.style.textAlign).toBe('');
    expect(parentRenderCount).toBe(1);

    resetFineGrainedDiagnostics();

    activeState!.set(true);
    flushScheduler();

    const ns = (
      globalThis as typeof globalThis & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__;

    expect(subject.style.padding).toBe('2rem');
    expect(subject.style.textAlign).toBe('center');
    expect(parentRenderCount).toBe(1);
    expect(ns?.['componentReruns']).toBe(0);
    expect(ns?.['effectRuns']).toBe(1);

    activeState!.set(false);
    flushScheduler();

    expect(subject.style.padding).toBe('1rem');
    expect(subject.style.textAlign).toBe('');

    cleanup();
  });

  test('should reject unsafe values from client style objects', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => (
      <div
        id="subject"
        style={{
          color: 'red',
          backgroundImage: 'url(https://attacker.test/tracker.png)',
          width: 'expression(alert(1))',
        }}
      />
    );

    createIsland({ root: container, component: Component });
    flushScheduler();

    const subject = container.querySelector('#subject') as HTMLDivElement;
    expect(subject.style.color).toBe('red');
    expect(subject.style.backgroundImage).toBe('');
    expect(subject.style.width).toBe('');
    expect(subject.getAttribute('style')).not.toContain('attacker.test');
    expect(subject.getAttribute('style')).not.toContain('expression');

    cleanup();
  });

  test('should update a reactive class prop without rerunning the parent component', () => {
    const { container, cleanup } = createTestContainer();

    let activeState: ReturnType<typeof state<boolean>>;
    let parentRenderCount = 0;

    const Component = () => {
      parentRenderCount += 1;
      activeState = state(false);

      return (
        <div
          id="subject"
          class={() => (activeState() ? 'row on' : 'row off')}
        />
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const subject = container.querySelector('#subject') as HTMLDivElement;
    expect(subject.className).toBe('row off');
    expect(parentRenderCount).toBe(1);

    resetFineGrainedDiagnostics();

    activeState!.set(true);
    flushScheduler();

    const ns = (
      globalThis as typeof globalThis & {
        __ASKR__?: Record<string, unknown>;
      }
    ).__ASKR__;

    expect(subject.className).toBe('row on');
    expect(parentRenderCount).toBe(1);
    expect(ns?.['componentReruns']).toBe(0);
    expect(ns?.['effectRuns']).toBe(1);

    cleanup();
  });

  test('should retain the last committed reactive prop dependencies when recompute fails', () => {
    allowFrameworkWarnings(
      /Unused state variable detected in Component at index 1/
    );
    const { container, cleanup } = createTestContainer();

    let primaryState: ReturnType<typeof state<string>>;
    let secondaryState: ReturnType<typeof state<string>>;
    let modeState: ReturnType<typeof state<'primary' | 'throw' | 'secondary'>>;
    let evaluations = 0;

    const Component = () => {
      primaryState = state('primary-1');
      secondaryState = state('secondary-1');
      modeState = state<'primary' | 'throw' | 'secondary'>('primary');

      return (
        <div
          id="subject"
          data-value={() => {
            evaluations += 1;

            const mode = modeState();
            if (mode === 'primary') {
              return primaryState();
            }

            if (mode === 'secondary') {
              return secondaryState();
            }

            secondaryState();
            throw new Error('reactive prop failure');
          }}
        />
      );
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const subject = container.querySelector('#subject');
    expect(subject?.getAttribute('data-value')).toBe('primary-1');

    evaluations = 0;
    modeState!.set('throw');
    flushScheduler();

    expect(subject?.getAttribute('data-value')).toBe('primary-1');
    expect(evaluations).toBe(1);

    evaluations = 0;
    secondaryState!.set('secondary-2');
    flushScheduler();

    expect(subject?.getAttribute('data-value')).toBe('primary-1');
    expect(evaluations).toBe(0);

    modeState!.set('secondary');
    flushScheduler();

    expect(subject?.getAttribute('data-value')).toBe('secondary-2');

    cleanup();
  });
});
