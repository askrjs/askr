import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('cross component updates (state)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should propagate state changes across components', () => {
    const Child = ({ value }: { value: number }) => {
      return <span>child: {value}</span>;
    };

    const Parent = () => {
      const shared = state(0);
      return (
        <div>
          <button onClick={() => shared.set(shared() + 1)}>inc</button>
          <Child value={shared()} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();

    expect(container.textContent).toBe('incchild: 0');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).toBe('incchild: 1');
  });

  it('should handle async state updates across deep tree', async () => {
    const Leaf = ({ value }: { value: number }) => {
      return <span>leaf: {value}</span>;
    };

    const Middle = ({ value }: { value: number }) => {
      return (
        <div>
          <Leaf value={value} />
        </div>
      );
    };

    const Root = () => {
      const shared = state(0);
      return (
        <div>
          <button
            onClick={async () => {
              await waitForNextEvaluation();
              shared.set(shared() + 1);
            }}
          >
            async inc
          </button>
          <Middle value={shared()} />
        </div>
      );
    };

    createIsland({ root: container, component: Root });
    flushScheduler();

    expect(container.textContent).toBe('async incleaf: 0');

    (container.querySelector('button') as HTMLButtonElement).click();
    await waitForNextEvaluation();
    flushScheduler();

    expect(container.textContent).toBe('async incleaf: 1');
  });

  it('should update parent to child', () => {
    const Child = ({ value }: { value: string }) => {
      return <span>{value}</span>;
    };

    const Parent = () => {
      const parentState = state('parent');
      return (
        <div>
          <button onClick={() => parentState.set('updated')}>update</button>
          <Child value={parentState()} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();

    expect(container.textContent).toBe('updateparent');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).toBe('updateupdated');
  });

  it('should handle sibling component updates', () => {
    const Sibling1 = ({ value }: { value: string }) => {
      return <span>{value}</span>;
    };

    const Sibling2 = ({ value }: { value: string }) => {
      return <span>{value}</span>;
    };

    const Parent = () => {
      const sibling1 = state('s1');
      const sibling2 = state('s2');
      return (
        <div>
          <button
            onClick={() => {
              sibling1.set('s1-updated');
              sibling2.set('s2-updated');
            }}
          >
            update both
          </button>
          <Sibling1 value={sibling1()} />
          <Sibling2 value={sibling2()} />
        </div>
      );
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();

    expect(container.textContent).toBe('update boths1s2');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).toBe('update boths1-updateds2-updated');
  });
});
