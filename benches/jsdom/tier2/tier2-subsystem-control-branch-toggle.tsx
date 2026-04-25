import { bench, describe } from 'vite-plus/test';
import { Case, Match, Show, createIsland, state } from '../../src';
import {
  createTestContainer,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { tier2BenchOptions } from '../../shared/_shared';

describe('tier2 control-flow branch toggles', () => {
  let cleanup: (() => void) | null = null;

  bench(
    'toggle Show truthy and fallback branches',
    () => {
      showVisible = !showVisible;
      visibleState!.set(showVisible);
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const App = () => {
          visibleState = state(true);
          return (
            <Show
              when={visibleState}
              fallback={<div id="show-fallback">fallback</div>}
            >
              <div id="show-truthy">truthy</div>
            </Show>
          );
        };

        createIsland({ root: result.container, component: App });
        flushScheduler();
        showVisible = true;
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        visibleState = null;
      },
    }
  );

  bench(
    'toggle Case branch selection',
    () => {
      caseLoading = !caseLoading;
      modeState!.set(caseLoading ? 'loading' : 'ready');
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

        const App = () => {
          modeState = state<'loading' | 'ready'>('loading');
          return (
            <Case fallback={<div id="case-fallback">fallback</div>}>
              <Match when={modeState() === 'loading'}>
                <div id="case-loading">loading</div>
              </Match>
              <Match when={modeState() === 'ready'}>
                <div id="case-ready">ready</div>
              </Match>
            </Case>
          );
        };

        createIsland({ root: result.container, component: App });
        flushScheduler();
        caseLoading = true;
      },
      teardown() {
        cleanup?.();
        cleanup = null;
        modeState = null;
      },
    }
  );
});

let visibleState: ReturnType<typeof state<boolean>> | null = null;
let modeState: ReturnType<typeof state<'loading' | 'ready'>> | null = null;
let showVisible = true;
let caseLoading = true;
