import { describe, it, expect } from 'vite-plus/test';
import { defineContext, readContext } from '../../../src/runtime/context';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

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

  it('should allow child to read parent-provided context through an intrinsic wrapper', () => {
    const Theme = defineContext('light');

    let observed: string | null = null;

    function Child(): JSXElement {
      observed = readContext(Theme);
      return <div>{'child'}</div>;
    }

    function App(): JSXElement {
      return (
        <Theme.Scope value={'dark'}>
          <div class={'shell'}>
            <Child />
          </div>
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

  it('should preserve scalar provider children and function-child output', () => {
    const Theme = defineContext('light');

    function App(): JSXElement {
      return (
        <div>
          <Theme.Scope value={'dark'}>{0}</Theme.Scope>
          <Theme.Scope value={'dark'}>
            {() => `${readContext(Theme)}:0`}
          </Theme.Scope>
        </div>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('0dark:0');
    } finally {
      cleanup();
    }
  });

  it('should ignore imperative DOM node children', () => {
    const Theme = defineContext('light');
    const imperativeChild = document.createElement('span');
    imperativeChild.id = 'imperative-context-child';
    imperativeChild.textContent = 'Imperative child';

    function App(): JSXElement {
      return (
        <Theme.Scope value={'dark'}>
          {imperativeChild as unknown as string}
        </Theme.Scope>
      );
    }

    const { container, cleanup } = createTestContainer();
    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      expect(container.textContent).toBe('');
      expect(container.querySelector('#imperative-context-child')).toBeNull();
    } finally {
      cleanup();
    }
  });

  it('should throw error when readContext() is called outside render', () => {
    const Ctx = defineContext(123);
    expect(() => readContext(Ctx)).toThrow();
  });
});
