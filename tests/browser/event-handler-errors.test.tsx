import { expect, test } from 'vite-plus/test';
import { createIsland } from '../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';

test('should dispatch a window error event when an event handler throws', () => {
  const { container, cleanup } = createTestContainer();
  const failure = new Error('handler failed');
  const reported: unknown[] = [];
  let outerClicks = 0;
  const onWindowError = (event: ErrorEvent) => {
    if (event.error !== failure) return;
    reported.push(event.error);
    event.preventDefault();
  };

  function App() {
    return (
      <div onClick={() => (outerClicks += 1)}>
        <button
          data-testid="throws"
          onClick={() => {
            throw failure;
          }}
        >
          boom
        </button>
      </div>
    );
  }

  window.addEventListener('error', onWindowError);
  try {
    createIsland({ root: container, component: App });
    flushScheduler();

    container
      .querySelector<HTMLButtonElement>('[data-testid="throws"]')!
      .click();
    flushScheduler();

    expect(reported).toEqual([failure]);
    expect(outerClicks).toBe(1);
  } finally {
    window.removeEventListener('error', onWindowError);
    cleanup();
  }
});
