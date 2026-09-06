import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import {
  DefaultPortal,
  Portal,
  _resetDefaultPortal,
} from '../../../src/foundations/structures/portal';
import { state } from '../../../src/index';
import {
  beginCommitTransaction,
  discardTransaction,
  commitTransaction,
} from '../../../src/runtime/component/lifecycle';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

function writePortalInNestedBatch(children: string): void {
  const batch = beginCommitTransaction();
  try {
    Portal({ children });
    commitTransaction(batch);
  } catch (error) {
    discardTransaction(batch);
    throw error;
  }
}

describe('DefaultPortal', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
    // Reset the default portal so tests don't share state
    _resetDefaultPortal();
  });

  afterEach(() => {
    cleanup();
  });

  it('should be present by default and render nothing until used', () => {
    createIsland({
      root: container,
      component: () => <div>{'App'}</div>,
    });
    flushScheduler();
    expect(container.textContent).toBe('App');
  });

  it('should render content into the default portal and clear it', () => {
    const App = () => {
      const tick = state(0);
      return (
        <button onClick={() => tick.set(tick() + 1)}>{`tick=${tick()}`}</button>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(typeof DefaultPortal.render).toBe('function');

    DefaultPortal.render({ children: 'Toast' });
    flushScheduler();
    expect(container.textContent).toContain('Toast');

    DefaultPortal.render({ children: undefined });
    flushScheduler();
    expect(container.textContent).not.toContain('Toast');
  });

  it('should render Portal children on initial render and update reactively', () => {
    const App = () => {
      const label = state('Toast');
      return (
        <>
          <button onClick={() => label.set('Updated')}>{'update'}</button>
          <Portal>{label()}</Portal>
        </>
      );
    };

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent).toContain('Toast');
    const initialPortalHost = Array.from(container.children).find(
      (element) => element.textContent === 'Toast'
    );
    expect(initialPortalHost).toBeDefined();

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).not.toContain('Toast');
    expect(container.textContent).toContain('Updated');
    expect(initialPortalHost?.isConnected).toBe(false);
    expect(container.textContent?.match(/Updated/g)).toHaveLength(1);
  });

  it('should preserve a replacement portal write adopted from a nested batch', () => {
    function NestedPortalWriter(props: { children: string }) {
      writePortalInNestedBatch(`${props.children} pending`);
      writePortalInNestedBatch(props.children);
      return null;
    }

    function App() {
      const label = state('Toast');
      return (
        <>
          <button onClick={() => label.set('Updated')}>{'update'}</button>
          <NestedPortalWriter>{label()}</NestedPortalWriter>
        </>
      );
    }

    createIsland({ root: container, component: App });
    flushScheduler();

    expect(container.textContent?.match(/Toast/g)).toHaveLength(1);

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).not.toContain('Toast');
    expect(container.textContent).not.toContain('pending');
    expect(container.textContent?.match(/Updated/g)).toHaveLength(1);
  });

  it('should roll back sequential nested portal writes with their parent batch', () => {
    createIsland({
      root: container,
      component: () => <main>{'content'}</main>,
    });
    flushScheduler();

    DefaultPortal.render({ children: 'Stable' });
    flushScheduler();
    expect(container.textContent?.match(/Stable/g)).toHaveLength(1);

    const rolledBackParent = beginCommitTransaction();
    writePortalInNestedBatch('Broken pending');
    writePortalInNestedBatch('Broken');
    discardTransaction(rolledBackParent);
    flushScheduler();

    expect(container.textContent?.match(/Stable/g)).toHaveLength(1);
    expect(container.textContent).not.toContain('Broken');
    expect(container.textContent).not.toContain('pending');

    const committedParent = beginCommitTransaction();
    writePortalInNestedBatch('Recovered pending');
    writePortalInNestedBatch('Recovered');
    commitTransaction(committedParent);
    flushScheduler();

    expect(container.textContent).not.toContain('Stable');
    expect(container.textContent).not.toContain('pending');
    expect(container.textContent?.match(/Recovered/g)).toHaveLength(1);
  });
});
