import { describe, test } from 'vite-plus/test';
import { state } from '../../src';
import { createIsland } from '../../src/boot';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions, runBench } from '../shared/_shared';

/** Components whose result is text, which the client anchors as a range. */
const COUNT = 200;

function Label(props: { value: number; index: number }) {
  return `${props.index}:${props.value}`;
}

function App() {
  tickState = state(0);
  const tick = tickState();
  return (
    <main>
      {Array.from({ length: COUNT }, (_, index) => (
        <Label value={tick} index={index} />
      ))}
    </main>
  );
}

function Toggled() {
  visibleState = state(false);
  const visible = visibleState();
  return (
    <main>
      {Array.from({ length: COUNT }, (_, index) =>
        visible ? <Label value={0} index={index} /> : null
      )}
    </main>
  );
}

describe('tier2 text-result components', () => {
  let cleanup: (() => void) | null = null;

  test('update 200 text-result components from one parent render', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'update 200 text-result components from one parent render',
      () => {
        tickState!.set(tickState!() + 1);
        flushScheduler();
      },
      {
        ...tier2BenchOptions,
        setup() {
          const result = createTestContainer();
          cleanup = result.cleanup;
          createIsland({ root: result.container, component: App });
          flushScheduler();
        },
        teardown() {
          cleanup?.();
          cleanup = null;
          tickState = null;
        },
      }
    );
  });

  test('mount then clean up 200 text-result components', async ({ bench }) => {
    await runBench(
      bench,
      'mount then clean up 200 text-result components',
      () => {
        const result = createTestContainer();
        createIsland({ root: result.container, component: App });
        flushScheduler();
        result.cleanup();
      },
      tier2BenchOptions
    );
  });

  test('toggle 200 text-result components between empty and text', async ({
    bench,
  }) => {
    await runBench(
      bench,
      'toggle 200 text-result components between empty and text',
      () => {
        visibleState!.set(!visibleState!());
        flushScheduler();
      },
      {
        ...tier2BenchOptions,
        setup() {
          const result = createTestContainer();
          cleanup = result.cleanup;
          createIsland({ root: result.container, component: Toggled });
          flushScheduler();
        },
        teardown() {
          cleanup?.();
          cleanup = null;
          visibleState = null;
        },
      }
    );
  });
});

let tickState: ReturnType<typeof state<number>> | null = null;
let visibleState: ReturnType<typeof state<boolean>> | null = null;
