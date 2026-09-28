/**
 * tests/dev_errors/error_messages.test.ts
 *
 * Error messages must be actionable and guide developers to solutions.
 */

import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

describe('error messages (DEV ERRORS)', () => {
  it('should give actionable error when state() is called outside render', () => {
    expect(() => state(0)).toThrow(
      /state\(\) can only be called during component render/i
    );
  });

  it('should give actionable error when state() is called conditionally', () => {
    const { container, cleanup } = createTestContainer();
    try {
      let flag: ReturnType<typeof state<boolean>> | null = null;

      const Component = () => {
        flag = state(false);
        if (flag()) {
          state('x');
        }
        return <div>{'ok'}</div>;
      };

      createIsland({ root: container, component: Component });
      flushScheduler();

      expect(() => {
        flag!.set(true);
        flushScheduler();
      }).toThrow(/conditionally|hook order|State index/i);
    } finally {
      cleanup();
    }
  });

  it('should give clear error when state.set() is called during render', () => {
    const { container, cleanup } = createTestContainer();
    try {
      const Bad = () => {
        const s = state(0);
        s.set(1);
        return <div>{'x'}</div>;
      };

      let error: unknown;
      try {
        createIsland({ root: container, component: Bad });
      } catch (caught) {
        error = caught;
      }

      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toMatch(
        /state\.set\(\) cannot be called during component render/i
      );
      // The explanation names the real failure mode: a render-time write
      // schedules another render of the same component.
      expect(message).toContain(
        'A write during render would schedule another render of the same component and could loop forever.'
      );
      expect(message).not.toMatch(/actor/i);
    } finally {
      cleanup();
    }
  });
});
