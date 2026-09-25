import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { cleanupApp, createIsland } from '../../../src/boot';
import { ErrorBoundary } from '../../../src/components';
import { getBlueprint } from '../../../src/renderer/intrinsic/blueprint-analysis';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

let currentLabel: State<string>;

function ReusedComponent() {
  return (
    <div>
      <p title={() => currentLabel()}>{'bound'}</p>
    </div>
  );
}

function App() {
  currentLabel = state('first');
  return <ReusedComponent />;
}

let failBinding: State<boolean>;

function ReusedFailure() {
  return (
    <p
      title={() => {
        if (failBinding()) throw new Error('binding failed');
        return 'ready';
      }}
    >
      {'bound'}
    </p>
  );
}

function FailureApp() {
  failBinding = state(false);
  return (
    <ErrorBoundary fallback={<p id="fallback">{'fallback'}</p>}>
      <ReusedFailure />
    </ErrorBoundary>
  );
}

describe('component reused across island lifetimes', () => {
  it('should keep function-valued props reactive in a second island', () => {
    const first = createTestContainer();
    const second = createTestContainer();

    try {
      createIsland({ root: first.container, component: App });
      expect(getBlueprint(ReusedComponent, document)).toBeDefined();
      currentLabel.set('first update');
      flushScheduler();
      expect(first.container.querySelector('p')?.title).toBe('first update');

      cleanupApp(first.container);

      createIsland({ root: second.container, component: App });
      expect(second.container.querySelector('p')?.title).toBe('first');
      currentLabel.set('second update');
      flushScheduler();
      expect(second.container.querySelector('p')?.title).toBe('second update');
    } finally {
      cleanupApp(first.container);
      cleanupApp(second.container);
      first.cleanup();
      second.cleanup();
    }
  });

  it('should route a reused binding failure to the second island boundary', () => {
    const first = createTestContainer();
    const second = createTestContainer();

    try {
      createIsland({ root: first.container, component: FailureApp });
      expect(first.container.querySelector('p')?.title).toBe('ready');
      cleanupApp(first.container);

      createIsland({ root: second.container, component: FailureApp });
      expect(second.container.querySelector('p')?.title).toBe('ready');
      failBinding.set(true);
      flushScheduler();
      expect(second.container.querySelector('#fallback')).not.toBeNull();
    } finally {
      cleanupApp(first.container);
      cleanupApp(second.container);
      first.cleanup();
      second.cleanup();
    }
  });
});
