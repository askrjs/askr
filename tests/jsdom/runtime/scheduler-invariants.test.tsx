import { describe, expect, it } from 'vite-plus/test';
import { derive, selector, state, type State } from '../../../src/index';
import { ErrorBoundary } from '../../../src/components';
import { task, watch } from '../../../src/resources';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('scheduler invariants', () => {
  it('should replay a newly entered source changed before its branch commits', () => {
    const { container, cleanup } = createTestContainer();
    let enterBranch!: () => void;
    let mountWriter!: () => void;
    let readerRenders = 0;
    let shared!: State<string>;
    let secondary!: State<string>;

    const Writer = () => {
      task(() => {
        shared.set('new');
        secondary.set('secondary-new');
      });
      return <span>{'writer'}</span>;
    };

    const WriterHost = () => {
      const visible = state(false);
      mountWriter = () => visible.set(true);
      return <section>{visible() ? <Writer /> : null}</section>;
    };

    const Reader = () => {
      readerRenders += 1;
      const open = state(false);
      enterBranch = () => open.set(true);
      return (
        <output>{open() ? `${shared()}:${secondary()}` : 'closed'}</output>
      );
    };

    const App = () => {
      shared = state('old');
      secondary = state('secondary-old');
      return (
        <main>
          <WriterHost />
          <Reader />
        </main>
      );
    };

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.querySelector('output')?.textContent).toBe('closed');
      expect(readerRenders).toBe(1);

      // Writer's task writes both sources in the same flush that Reader
      // first reads them; the reader must end on the written values.
      mountWriter();
      enterBranch();
      flushScheduler();

      expect(container.querySelector('output')?.textContent).toBe(
        'new:secondary-new'
      );
      // Both writes land in one follow-up render, not one render per source.
      expect(readerRenders).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('should drop obsolete watch dependencies after switching branches', () => {
    const { container, cleanup } = createTestContainer();
    let useLeft!: State<boolean>;
    let left!: State<string>;
    let right!: State<string>;
    const observed: string[] = [];

    createIsland({
      root: container,
      component: () => {
        useLeft = state(true);
        left = state('left:0');
        right = state('right:0');
        watch(
          () => (useLeft() ? left() : right()),
          (value) => {
            observed.push(value);
          }
        );
        return <div />;
      },
    });
    flushScheduler();

    try {
      expect(observed).toEqual(['left:0']);

      left.set('left:1');
      flushScheduler();
      expect(observed).toEqual(['left:0', 'left:1']);

      useLeft.set(false);
      flushScheduler();
      expect(observed).toEqual(['left:0', 'left:1', 'right:0']);

      left.set('left:2');
      flushScheduler();
      expect(observed).toEqual(['left:0', 'left:1', 'right:0']);

      right.set('right:1');
      flushScheduler();
      expect(observed).toEqual(['left:0', 'left:1', 'right:0', 'right:1']);
    } finally {
      cleanup();
    }
  });

  it('should skip a queued watch whose owner unmounts before it runs', () => {
    const { container, cleanup } = createTestContainer();
    let source!: State<number>;
    let showFirst!: State<boolean>;
    const observed: string[] = [];

    const Watcher = ({ name }: { name: string }) => {
      watch(source, (value) => {
        observed.push(`${name}:${value}`);
      });
      return null;
    };

    createIsland({
      root: container,
      component: () => {
        source = state(0);
        showFirst = state(true);
        return (
          <div>
            {showFirst() ? <Watcher name="first" /> : null}
            <Watcher name="second" />
          </div>
        );
      },
    });
    flushScheduler();

    try {
      observed.length = 0;
      source.set(1);
      showFirst.set(false);
      flushScheduler();

      expect(observed).toEqual(['second:1']);
    } finally {
      cleanup();
    }
  });

  it('should re-render a component after its update loop trips the depth guard', () => {
    const { container, cleanup } = createTestContainer();
    let count!: State<number>;
    let looping = false;

    createIsland({
      root: container,
      component: () => {
        count = state(0);
        const value = count();
        return (
          <div
            ref={() => {
              if (looping) count.set(value + 1);
            }}
          >
            {String(value)}
          </div>
        );
      },
    });
    flushScheduler();

    looping = true;
    count.set(1);
    expect(() => flushScheduler()).toThrow(/exceeded MAX_FLUSH_DEPTH/);

    looping = false;
    count.set(12345);
    flushScheduler();

    expect(container.textContent).toBe('12345');
    cleanup();
  });

  it('should report a watch loop to its boundary after sibling watches run', () => {
    const { container, cleanup } = createTestContainer();
    let x!: State<number>;
    const seen: number[] = [];
    const reported: unknown[] = [];
    let looping = false;
    let lastZ = 0;

    const Loops = () => {
      x = state(0);
      const y = state(0);
      const z = state(0);
      watch(x, (value) => y.set(value + 1));
      watch(z, (value) => {
        seen.push(value);
      });
      watch(y, (value) => {
        if (!looping) return;
        lastZ = value;
        z.set(value);
        x.set(value + 1);
      });
      return <div />;
    };

    createIsland({
      root: container,
      component: () => (
        <ErrorBoundary
          fallback={(error) => {
            reported.push(error);
            return <p>stopped</p>;
          }}
        >
          <Loops />
        </ErrorBoundary>
      ),
    });
    flushScheduler();

    looping = true;
    x.set(1);
    flushScheduler();
    looping = false;

    expect(String(reported[0])).toMatch(/reactive cycle in watch\(\)/);
    expect(container.textContent).toBe('stopped');
    // The loop does not starve the sibling watch while it runs.
    expect(lastZ).toBeGreaterThan(1);
    expect(seen.length).toBeGreaterThan(1);
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });
    cleanup();
  });

  it('should keep cleanup-triggered writes coherent during an active flush', () => {
    const { container, cleanup } = createTestContainer();
    let showChild!: State<boolean>;
    let cleanupWrites!: State<number>;
    let cleanupRuns = 0;

    const Child = () => {
      task(() => () => {
        cleanupRuns += 1;
        cleanupWrites.set((value) => value + 1);
      });
      return <span id={'child'}>{'child'}</span>;
    };

    const App = () => {
      showChild = state(true);
      cleanupWrites = state(0);

      return (
        <section>
          {showChild() ? <Child /> : null}
          <output id={'writes'}>{String(cleanupWrites())}</output>
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    showChild.set(false);
    flushScheduler();

    expect(cleanupRuns).toBe(1);
    expect(container.querySelector('#child')).toBeNull();
    expect(container.querySelector('#writes')?.textContent).toBe('1');
    expect(getSchedulerState()).toMatchObject({
      queueLength: 0,
      running: false,
    });

    cleanup();
  });

  it('should not resurrect a disposed component after cleanup-triggered writes', () => {
    const { container, cleanup } = createTestContainer();
    let showChild!: State<boolean>;
    let shared!: State<number>;
    let childRenders = 0;
    let cleanupRuns = 0;

    const Child = () => {
      childRenders += 1;
      task(() => () => {
        cleanupRuns += 1;
        shared.set((value) => value + 1);
      });
      return <span id={'child'}>{String(shared())}</span>;
    };

    const Sink = () => <output id={'sink'}>{String(shared())}</output>;

    const App = () => {
      showChild = state(true);
      shared = state(0);

      return (
        <section>
          {showChild() ? <Child /> : null}
          <Sink />
        </section>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(childRenders).toBe(1);
    expect(container.querySelector('#child')?.textContent).toBe('0');
    expect(container.querySelector('#sink')?.textContent).toBe('0');

    showChild.set(false);
    flushScheduler();
    shared.set((value) => value + 1);
    flushScheduler();

    expect(cleanupRuns).toBe(1);
    expect(childRenders).toBe(1);
    expect(container.querySelector('#child')).toBeNull();
    expect(container.querySelector('#sink')?.textContent).toBe('2');

    cleanup();
  });
});

describe.each(['development', 'production'])(
  'reactive batch loop guard (%s)',
  (env) => {
    // Safety cap so an unguarded loop fails the test instead of hanging.
    const safetyCap = 5_000;

    function errorMessages(error: unknown): string {
      if (error instanceof AggregateError) {
        return error.errors.map(errorMessages).join('\n');
      }
      return String(error);
    }

    function withEnv(run: () => void): void {
      const prev = process.env.NODE_ENV;
      process.env.NODE_ENV = env;
      try {
        run();
      } finally {
        process.env.NODE_ENV = prev;
      }
    }

    function expectWriteRejected(render: (looping: () => boolean) => void) {
      const { container, cleanup } = createTestContainer();
      let looping = false;
      let trigger!: () => void;
      createIsland({
        root: container,
        component: () => {
          const start = state(0);
          trigger = () => start.set(1);
          start();
          render(() => looping);
          return <div />;
        },
      });
      flushScheduler();

      let error: unknown;
      withEnv(() => {
        looping = true;
        try {
          trigger();
          flushScheduler();
        } catch (caught) {
          error = caught;
        }
        looping = false;
      });
      cleanup();
      return errorMessages(error);
    }

    it('should stop a selector whose source writes a state it reads', () => {
      let runs = 0;
      const message = expectWriteRejected((looping) => {
        const s = state(0);
        const isSelected = selector(() => {
          const value = s();
          if (looping() && ++runs < safetyCap) s.set(value + 1);
          return 0;
        });
        isSelected(0);
      });
      expect(runs).toBeLessThan(safetyCap);
      expect(message).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
    });

    it('should stop a derive and selector that write each other', () => {
      let runs = 0;
      const message = expectWriteRejected((looping) => {
        const a = state(0);
        const b = state(0);
        const d = derive(() => {
          const value = a();
          if (looping() && ++runs < safetyCap) b.set(value + 1);
          return value;
        });
        const isSelected = selector(() => {
          const value = b();
          if (looping() && ++runs < safetyCap) a.set(value + 1);
          return 0;
        });
        d();
        isSelected(0);
      });
      expect(runs).toBeLessThan(safetyCap);
      expect(message).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
    });

    it('should stop two derives that write each other', () => {
      let runs = 0;
      const message = expectWriteRejected((looping) => {
        const a = state(0);
        const b = state(0);
        const first = derive(() => {
          const value = a();
          if (looping() && ++runs < safetyCap) b.set(value + 1);
          return value;
        });
        const second = derive(() => {
          const value = b();
          if (looping() && ++runs < safetyCap) a.set(value + 1);
          return value;
        });
        first();
        second();
      });
      expect(runs).toBeLessThan(safetyCap);
      expect(message).toMatch(
        /cannot be called inside a derive\(\) or selector\(\) computation/
      );
    });
  }
);
