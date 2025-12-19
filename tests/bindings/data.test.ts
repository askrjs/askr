import { describe, it, expect } from 'vitest';
import { createApp, resource } from '../../src/index';
import type { ComponentFunction } from '../../src/runtime/component';
import {
  createTestContainer,
  flushScheduler,
  waitForNextEvaluation,
} from '../helpers/test_renderer';

describe('data() (DATA_SPEC / BINDING_SPEC) — gaps', () => {
  it('should execute data function when component mounts', async () => {
    const calls: Array<string> = [];

    async function fetchUser(input: { id: string }) {
      calls.push(`fetch:${input.id}`);
      return { name: 'A' };
    }

    const App: ComponentFunction = () => {
      // Spec: this must NOT execute fetchUser during render.
      resource(() => fetchUser({ id: '123' }), ['123']);
      return { type: 'div', children: ['ok'] };
    };

    const { container, cleanup } = createTestContainer();
    try {
      createApp({ root: container, component: App });
      flushScheduler();

      // Allow any mount-triggered work to run.
      await waitForNextEvaluation();
      flushScheduler();

      expect(calls).toEqual(['fetch:123']);
    } finally {
      cleanup();
    }
  });
});
