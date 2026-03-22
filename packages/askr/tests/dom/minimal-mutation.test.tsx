/**
 * tests/dom/minimal_mutation.test.ts
 *
 * DOM updates must be minimal: only changed attributes/content updated.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { state } from '../../src/index';
import {
  createTestContainer,
  flushScheduler,
  trackDOMMutations,
} from '../helpers/test-renderer';
import { createIsland } from '../helpers/create-island';

describe('minimal DOM mutation (DOM)', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    const result = createTestContainer();
    container = result.container;
    cleanup = result.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  describe('only changed nodes updated', () => {
    it('should not modify unchanged siblings when state changes', async () => {
      let value: ReturnType<typeof state<number>> | null = null;

      const Component = () => {
        value = state(1);
        return (
          <div>
            <span id={'a'}>{'A'}</span>
            <span id={'b'}>{`${value()}`}</span>
            <span id={'c'}>{'C'}</span>
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const _a = container.querySelector('#a') as HTMLElement;
      const _b = container.querySelector('#b') as HTMLElement;
      const _c = container.querySelector('#c') as HTMLElement;

      // Check initial state
      expect(_b.textContent).toBe('1');

      const mutations = trackDOMMutations(container, () => {
        value!.set(2);
        flushScheduler();
      });

      // Check final state
      expect(_b.textContent).toBe('2');

      // Minimal mutation expectation — see issues/minimal-mutation.md
      const totalMutations =
        mutations.addedNodes +
        mutations.removedNodes +
        mutations.changedAttributes +
        mutations.changedText;

      // Ensure something changed
      expect(totalMutations).toBeGreaterThan(0);

      // Siblings should not have been modified
      expect(_a.textContent).toBe('A');
      expect(_c.textContent).toBe('C');
    });

    it('should update text content efficiently when state changes', async () => {
      let text: ReturnType<typeof state<string>> | null = null;

      const Component = () => {
        text = state('hello');
        return <div>{text()}</div>;
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      const div = container.querySelector('div') as HTMLElement;
      text!.set('world');
      flushScheduler();

      expect(div.textContent).toBe('world');
    });

    it('should update only changed attributes when state changes', async () => {
      let color: ReturnType<typeof state<string>> | null = null;

      const Component = () => {
        color = state('red');
        return (
          <div class={'box'} style={`color: ${color()}`}>
            {'content'}
          </div>
        );
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      color!.set('blue');
      flushScheduler();

      const div = container.querySelector('div') as HTMLElement;
      expect(div.style.color).toContain('blue');
      expect(div.className).toBe('box');
    });
  });
});
