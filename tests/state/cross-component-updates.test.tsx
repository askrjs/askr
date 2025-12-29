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
      return { type: 'span', props: { children: [`child: ${value}`] } };
    };

    const Parent = () => {
      const shared = state(0);
      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                onClick: () => shared.set(shared() + 1),
                children: ['inc'],
              },
            },
            { type: Child, props: { value: shared() } },
          ],
        },
      };
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
      return { type: 'span', props: { children: [`leaf: ${value}`] } };
    };

    const Middle = ({ value }: { value: number }) => {
      return {
        type: 'div',
        props: { children: [{ type: Leaf, props: { value } }] },
      };
    };

    const Root = () => {
      const shared = state(0);
      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                onClick: async () => {
                  await waitForNextEvaluation();
                  shared.set(shared() + 1);
                },
                children: ['async inc'],
              },
            },
            { type: Middle, props: { value: shared() } },
          ],
        },
      };
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
      return { type: 'span', props: { children: [value] } };
    };

    const Parent = () => {
      const parentState = state('parent');
      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                onClick: () => parentState.set('updated'),
                children: ['update'],
              },
            },
            { type: Child, props: { value: parentState() } },
          ],
        },
      };
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
      return { type: 'span', props: { children: [value] } };
    };

    const Sibling2 = ({ value }: { value: string }) => {
      return { type: 'span', props: { children: [value] } };
    };

    const Parent = () => {
      const sibling1 = state('s1');
      const sibling2 = state('s2');
      return {
        type: 'div',
        props: {
          children: [
            {
              type: 'button',
              props: {
                onClick: () => {
                  sibling1.set('s1-updated');
                  sibling2.set('s2-updated');
                },
                children: ['update both'],
              },
            },
            { type: Sibling1, props: { value: sibling1() } },
            { type: Sibling2, props: { value: sibling2() } },
          ],
        },
      };
    };

    createIsland({ root: container, component: Parent });
    flushScheduler();

    expect(container.textContent).toBe('update boths1s2');

    (container.querySelector('button') as HTMLButtonElement).click();
    flushScheduler();

    expect(container.textContent).toBe('update boths1-updateds2-updated');
  });
});
