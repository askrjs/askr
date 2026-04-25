import { bench, describe, expect } from 'vite-plus/test';
import { createIsland } from '../../src';
import {
  disableEventDelegation,
  enableEventDelegation,
  setGlobalDelegationContainer,
} from '../../../src/runtime/events';
import {
  createTestContainer,
  fireEvent,
  flushScheduler,
} from '../../tests/helpers/test-renderer';
import { tier2BenchOptions } from '../../shared/_shared';

{
  const { container, cleanup } = createTestContainer();
  let clicks = 0;

  const Component = () => (
    <div>
      {Array.from({ length: 500 }, (_, index) => (
        <button
          id={`btn-${index}`}
          onClick={() => {
            clicks += 1;
          }}
        >
          Button {index}
        </button>
      ))}
    </div>
  );

  try {
    enableEventDelegation();
    setGlobalDelegationContainer(container);
    createIsland({ root: container, component: Component });
    flushScheduler();
    fireEvent.click(container.querySelector('#btn-250') as HTMLElement);
    flushScheduler();
    expect(clicks).toBe(1);
  } finally {
    disableEventDelegation();
    setGlobalDelegationContainer(document.body);
    cleanup();
  }
}

describe('tier2 events delegation', () => {
  let cleanup: (() => void) | null = null;
  let container: HTMLDivElement | null = null;

  bench(
    'dispatch one delegated click in a 500-button tree',
    () => {
      fireEvent.click(container!.querySelector('#btn-250') as HTMLElement);
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;
        container = result.container;

        const Component = () => (
          <div>
            {Array.from({ length: 500 }, (_, index) => (
              <button id={`btn-${index}`} onClick={() => undefined}>
                Button {index}
              </button>
            ))}
          </div>
        );

        enableEventDelegation();
        setGlobalDelegationContainer(result.container);
        createIsland({ root: result.container, component: Component });
        flushScheduler();
      },
      teardown() {
        disableEventDelegation();
        setGlobalDelegationContainer(document.body);
        cleanup?.();
        cleanup = null;
        container = null;
      },
    }
  );
});
