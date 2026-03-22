import { describe, it, expect } from 'vitest';
import { defineContext, readContext } from '../../src/runtime/context';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import type { JSXElement } from '../../src/jsx/types';
import { createIsland } from '../helpers/create-island';

describe('context (CONTEXT_SPEC) — gaps', () => {
  it('should allow child to read parent-provided context value', () => {
    const Theme = defineContext('light');

    let observed: string | null = null;

    function Child(): JSXElement {
      observed = readContext(Theme);
      return <div>{'child'}</div>;
    }

    function App(): JSXElement {
      return (
        <Theme.Scope value={'dark'}>
          <Child />
        </Theme.Scope>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
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
