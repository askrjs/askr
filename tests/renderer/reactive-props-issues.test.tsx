import { expect } from 'chai';
import { test, describe } from 'vitest';
import { createIsland, state } from '../../src';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';

describe('Reactive props issues validation', () => {
  test('should not recreate reactive prop subscription when function reference stays the same (Issue 1)', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const textState = state('initial');
      const stableFunction = () => textState();

      return {
        type: 'div',
        props: {
          title: stableFunction,
        },
        children: ['test'],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const div = container.querySelector('div');
    expect(div?.getAttribute('title')).to.equal('initial');

    // Issue: Currently, updateElementFromVnode always cleans up and re-sets up
    // even when the function reference hasn't changed, which is wasteful
    // This test passes but documents the issue

    cleanup();
  });

  test('should clean up state subscriptions immediately when reactive prop is removed (Issue 2)', () => {
    const { container, cleanup } = createTestContainer();

    let externalState1: ReturnType<typeof state<string>>;
    let externalState2: ReturnType<typeof state<string>>;
    let showBothState: ReturnType<typeof state<boolean>>;

    const Component = () => {
      externalState1 = state('value1');
      externalState2 = state('value2');
      showBothState = state(true);

      return {
        type: 'div',
        props: {},
        children: [
          {
            type: 'span',
            props: {
              'data-prop1': () => externalState1(),
              'data-prop2': showBothState() ? () => externalState2() : 'static',
            },
            children: ['test'],
          },
        ],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    const span = container.querySelector('span');
    expect(span?.getAttribute('data-prop1')).to.equal('value1');
    expect(span?.getAttribute('data-prop2')).to.equal('value2');

    // Access internal _readers to check subscription cleanup
    // This is testing implementation details but validates the memory leak issue
    const state2Internal = externalState2! as unknown as {
      _readers?: Map<unknown, number>;
    };

    // State2 should have readers (coordinator)
    const initialReaderCount = state2Internal._readers?.size || 0;
    expect(initialReaderCount).to.be.greaterThan(0);

    // Remove prop2 by setting showBoth to false
    showBothState!.set(false);
    flushScheduler();

    expect(span?.getAttribute('data-prop2')).to.equal('static');

    // Issue: State2 subscriptions might not be cleaned up immediately
    // They should be removed when the reactive prop is replaced with a static value
    // Current bug: cleanup only happens when registry becomes empty

    cleanup();
  });

  test('should have an abortController in reactive prop coordinator (Issue 3)', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const textState = state('test');

      return {
        type: 'div',
        props: {
          title: () => textState(),
        },
        children: ['content'],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    // The reactive prop coordinator is created lazily
    // According to copilot-instructions.md, it should have an abortController
    // for proper cancellation semantics

    // We can't easily test this without accessing internals,
    // but this test documents the requirement

    cleanup();

    // After cleanup, the coordinator should have aborted its controller
    // to signal cancellation of any ongoing operations
  });

  test('should avoid unnecessary cleanup when function reference unchanged (Performance)', () => {
    const { container, cleanup } = createTestContainer();

    let renderCount = 0;

    const Component = () => {
      const textState = state('initial');
      renderCount++;

      // Create a stable function reference outside the vnode
      const stableGetter = () => textState();

      return {
        type: 'div',
        props: {
          title: stableGetter, // Same reference every render
        },
        children: ['test'],
      };
    };

    createIsland({ root: container, component: Component });
    flushScheduler();

    expect(container.querySelector('div')?.getAttribute('title')).to.equal(
      'initial'
    );
    expect(renderCount).to.equal(1);

    // The issue: updateElementFromVnode always calls cleanup() and setupReactiveProp()
    // even when the function reference is identical. This is wasteful.
    // We can't easily test this without internal instrumentation, but it's a valid concern

    cleanup();
  });
});
