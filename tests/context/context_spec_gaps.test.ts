import { describe, it, expect } from 'vitest';
import { createApp, defineContext, readContext } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';
import type { JSXElement } from '../../src/jsx/types';

describe('context (CONTEXT_SPEC) — gaps', () => {
  it('should allow child to read parent-provided context value', () => {
    const Theme = defineContext('light');

    let observed: string | null = null;

    function Child(): JSXElement {
      observed = readContext(Theme);
      return { type: 'div', props: { children: ['child'] } };
    }

    function App(): JSXElement {
      return {
        type: Theme.Scope as unknown as
          | string
          | ((props: Record<string, unknown>) => JSXElement),
        props: {
          value: 'dark',
          children: [
            {
              type: Child as unknown as (
                props: Record<string, unknown>
              ) => JSXElement,
              props: {},
            },
          ],
        },
      };
    }

    const { container, cleanup } = createTestContainer();
    try {
      createApp({ root: container, component: App });
      flushScheduler();
      expect(observed).toBe('dark');
    } finally {
      cleanup();
    }
  });

  it('should throw error when readContext() is called outside render', () => {
    const Ctx = defineContext(123);
    expect(() => readContext(Ctx)).toThrow();
  });
});
