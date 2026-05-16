import { bench, describe, expect } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import {
  disableEventDelegation,
  enableEventDelegation,
  setGlobalDelegationContainer,
} from '../../src/runtime/events';
import {
  createTestContainer,
  fireEvent,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions } from '../shared/_shared';

const targetIndexes = Array.from({ length: 1000 }, (_, index) => index % 500);

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

    const targetButtons = targetIndexes.map((index) => {
      const button = container.querySelector(`#btn-${index}`);
      expect(button).not.toBeNull();
      return button as HTMLElement;
    });

    for (const button of targetButtons) {
      fireEvent.click(button);
    }
    flushScheduler();

    expect(clicks).toBe(1000);
  } finally {
    disableEventDelegation();
    setGlobalDelegationContainer(document.body);
    cleanup();
  }
}

describe('tier2 subsystem events burst delegation', () => {
  let cleanup: (() => void) | null = null;
  let targetButtons: HTMLElement[] = [];

  bench(
    'dispatch 1,000 delegated clicks across a 500-button tree',
    () => {
      for (const button of targetButtons) {
        fireEvent.click(button);
      }
      flushScheduler();
    },
    {
      ...tier2BenchOptions,
      setup() {
        const result = createTestContainer();
        cleanup = result.cleanup;

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
        targetButtons = targetIndexes.map((index) => {
          const button = result.container.querySelector(`#btn-${index}`);
          if (!(button instanceof HTMLElement)) {
            throw new Error(`missing delegated target button: ${index}`);
          }
          return button;
        });
      },
      teardown() {
        disableEventDelegation();
        setGlobalDelegationContainer(document.body);
        cleanup?.();
        cleanup = null;
        targetButtons = [];
      },
    }
  );
});
