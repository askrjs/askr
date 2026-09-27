import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { createIsland, hydrateSPA } from '../../../src/boot';
import { currentOwner, onDispose } from '../../../src/core/api/hooks';
import { defineSetupComponent } from '../../../src/core/component/setup';
import { ComponentInstance } from '../../../src/core/component/instance';
import { resource, watch } from '../../../src/resources';
import { renderToStringSync } from '../../../src/ssr';
import { routeRegistryFromTable } from '../../router-test-utils';
import {
  flushScheduler,
  createTestContainer,
  waitForNextEvaluation,
} from '../../../test-utils/render/test-renderer';

const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

function resetExecutionModel(): void {
  delete (globalThis as Record<symbol, unknown>)[EXECUTION_MODEL_KEY];
}

describe('internal setup component prototype', () => {
  beforeEach(resetExecutionModel);
  afterEach(resetExecutionModel);

  it('should use the same setup execution for SSR and hydration', async () => {
    const { container, cleanup } = createTestContainer();
    let setupRuns = 0;
    const View = defineSetupComponent<{ label: string }>((initialProps) => {
      setupRuns++;
      expect(initialProps.label).toBe('server');
      return (props) => <output>{props.label}</output>;
    });
    const App = () => <View label="server" />;
    const html = renderToStringSync(() => <App />);
    container.innerHTML = html;
    const output = container.querySelector('output');

    try {
      await hydrateSPA({
        root: container,
        registry: routeRegistryFromTable([{ path: '/', handler: App }]),
      });
      expect(container.querySelector('output')).toBe(output);
      expect(output?.textContent).toBe('server');
      expect(setupRuns).toBeGreaterThanOrEqual(2);
    } finally {
      cleanup();
    }
  });

  it('should run setup once and keep ordinary conditional output and cleanup', () => {
    const { container, cleanup } = createTestContainer();
    let visible!: State<boolean>;
    let label!: State<string>;
    let count!: State<number>;
    let setupRuns = 0;
    let renderRuns = 0;
    let childCleanups = 0;

    function Leaf() {
      onDispose(currentOwner()!, () => childCleanups++);
      return <i>leaf</i>;
    }

    const View = defineSetupComponent<{ label: string; visible: boolean }>(
      (initialProps) => {
        setupRuns++;
        count = state(1);
        expect(initialProps.label).toBe('first');
        return (props) => {
          renderRuns++;
          return (
            <section>
              <output>{`${props.label}:${count()}`}</output>
              {props.visible ? <Leaf /> : null}
            </section>
          );
        };
      }
    );

    const App = () => {
      visible = state(true);
      label = state('first');
      return <View label={label()} visible={visible()} />;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('first:1leaf');
      expect(setupRuns).toBe(1);
      expect(renderRuns).toBe(1);

      count.set(2);
      flushScheduler();
      expect(container.querySelector('output')?.textContent).toBe('first:2');
      expect(setupRuns).toBe(1);
      expect(renderRuns).toBe(2);

      label.set('second');
      flushScheduler();
      expect(container.querySelector('output')?.textContent).toBe('second:2');
      expect(setupRuns).toBe(1);
      expect(renderRuns).toBe(3);

      visible.set(false);
      flushScheduler();
      expect(container.textContent).toBe('second:2');
      expect(childCleanups).toBe(1);
      expect(setupRuns).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should retain committed DOM and setup state after a failed render, then recover', () => {
    const { container, cleanup } = createTestContainer();
    let props!: State<{ broken: boolean }>;
    let count!: State<number>;
    let setupRuns = 0;
    const View = defineSetupComponent<{ broken: boolean }>((_initialProps) => {
      setupRuns++;
      count = state(0);
      return (nextProps) => {
        if (nextProps.broken) throw new Error('setup render failed');
        return <button>{count()}</button>;
      };
    });
    const App = () => {
      props = state<{ broken: boolean }>({ broken: false });
      return <View broken={props().broken} />;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      count.set(4);
      flushScheduler();
      const committed = container.querySelector('button');

      props.set({ broken: true });
      expect(() => flushScheduler()).toThrow('setup render failed');
      expect(container.querySelector('button')).toBe(committed);
      expect(committed?.textContent).toBe('4');

      props.set({ broken: false });
      flushScheduler();
      expect(container.querySelector('button')).toBe(committed);
      expect(committed?.textContent).toBe('4');
      expect(setupRuns).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should dispose keyed setup state and initialize fresh state for a new key', () => {
    const { container, cleanup } = createTestContainer();
    let key!: State<string>;
    let count!: State<number>;
    let setupRuns = 0;
    let cleanups = 0;
    const View = defineSetupComponent<{ id: string }>(() => {
      setupRuns++;
      count = state(0);
      onDispose(currentOwner()!, () => cleanups++);
      return (props) => <output>{`${props.id}:${count()}`}</output>;
    });
    const App = () => {
      key = state('first');
      return <View key={key()} id={key()} />;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      count.set(3);
      flushScheduler();
      expect(container.textContent).toBe('first:3');

      key.set('second');
      flushScheduler();
      expect(container.textContent).toBe('second:0');
      expect(setupRuns).toBe(2);
      expect(cleanups).toBe(1);
    } finally {
      cleanup();
    }
  });

  it('should reject lifecycle declarations from the render callback', () => {
    const Invalid = defineSetupComponent(() => () => {
      state(0);
      return <div>invalid</div>;
    });
    const instance = new ComponentInstance(null, Invalid, {});

    expect(() => instance.render()).toThrow(
      /cannot be called during setup component render/
    );
  });

  it('should refresh a setup-owned resource when its live prop changes', async () => {
    const { container, cleanup } = createTestContainer();
    let id!: State<string>;
    const requests: Array<{ id: string; signal: AbortSignal }> = [];
    const View = defineSetupComponent((_, __, currentProps) => {
      const result = resource(({ signal }) => {
        requests.push({ id: String(currentProps().id), signal });
        return new Promise<string>(() => {});
      }, []);
      watch(
        () => currentProps().id,
        (_value, context) => {
          if (!context.initial) result.refresh();
        }
      );
      return () => <output>{result.pending ? 'pending' : result.value}</output>;
    });
    const App = () => {
      id = state('first');
      return <View id={id()} />;
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();
      expect(requests.map((request) => request.id)).toEqual(['first']);

      id.set('second');
      flushScheduler();
      await waitForNextEvaluation();
      flushScheduler();

      expect(requests.map((request) => request.id)).toEqual([
        'first',
        'second',
      ]);
      expect(requests[0]!.signal.aborted).toBe(true);
      expect(requests[1]!.signal.aborted).toBe(false);
    } finally {
      cleanup();
    }
  });
});
