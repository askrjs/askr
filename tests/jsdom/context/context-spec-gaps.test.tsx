import { describe, it, expect } from 'vite-plus/test';
import { defineScope, readScope } from '../../../src/runtime/context';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

describe('context (CONTEXT_SPEC) — gaps', () => {
  it('should create a renderer-transparent vnode given a callable scope', () => {
    const Theme = defineScope('light');
    const element = (
      <Theme value="dark">
        <span>child</span>
      </Theme>
    );

    expect(element.type).not.toBe(Theme);
  });

  it('should allow child to read parent-provided context value', () => {
    const Theme = defineScope('light');

    let observed: string | null = null;

    function Child(): JSXElement {
      observed = readScope(Theme);
      return <div>{'child'}</div>;
    }

    function App(): JSXElement {
      return (
        <Theme value={'dark'}>
          <Child />
        </Theme>
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
    const Theme = defineScope('light');

    let observed: string | null = null;

    function Child(): JSXElement {
      observed = readScope(Theme);
      return <div>{'child'}</div>;
    }

    function App(): JSXElement {
      return (
        <Theme value={'dark'}>
          <div class={'shell'}>
            <Child />
          </div>
        </Theme>
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
    const Theme = defineScope('light');

    function App(): JSXElement {
      return (
        <div>
          <Theme value={'dark'}>{0}</Theme>
          <Theme value={'dark'}>{() => `${readScope(Theme)}:0`}</Theme>
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
    const Theme = defineScope('light');
    const imperativeChild = document.createElement('span');
    imperativeChild.id = 'imperative-context-child';
    imperativeChild.textContent = 'Imperative child';

    function App(): JSXElement {
      return (
        <Theme value={'dark'}>{imperativeChild as unknown as string}</Theme>
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

  it('should throw error when readScope() is called outside render', () => {
    const ScopeValue = defineScope(123);
    expect(() => readScope(ScopeValue)).toThrow();
  });
});
