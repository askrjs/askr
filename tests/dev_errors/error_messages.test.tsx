/**
 * tests/dev_errors/error_messages.test.ts
 *
 * Error messages must be actionable and guide developers to solutions.
 */

import { describe, it, expect } from 'vitest';
import { createApp, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

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
        return { type: 'div', children: ['ok'] };
      };

      createApp({ root: container, component: Component });
      flushScheduler();

      expect(() => flag!.set(true)).toThrow(
        /conditionally|hook order|State index/i
      );
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
        return { type: 'div', children: ['x'] };
      };

      expect(() => createApp({ root: container, component: Bad })).toThrow(
        /state\.set\(\) cannot be called during component render/i
      );
    } finally {
      cleanup();
    }
  });
});
