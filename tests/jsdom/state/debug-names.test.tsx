import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { derive, selector, state, store } from '../../../src';
import { logger } from '../../../src/common/logger';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

function mount(component: () => unknown) {
  const { container, cleanup } = createTestContainer();
  createIsland({ root: container, component: component as never });
  flushScheduler();
  return { container, cleanup };
}

describe('debug names', () => {
  afterEach(() => vi.restoreAllMocks());

  it('should name a derive in its recursive-read error', () => {
    expect(() =>
      mount(() => {
        const loop: () => number = derive(() => loop(), { name: 'loop' });
        return <p>{loop()}</p>;
      })
    ).toThrow('derive("loop") cannot read itself recursively');
    expect(() =>
      mount(() => {
        const loop: () => number = derive(() => loop());
        return <p>{loop()}</p>;
      })
    ).toThrow('derive() cannot read itself recursively');
  });

  it('should accept a name on selector and use it for the mapped derive form', () => {
    const { container, cleanup } = mount(() => {
      const n = state(1, { name: 'n' });
      const isOne = selector(n, { name: 'isOne' });
      const doubled = derive(n, (v) => v * 2, { name: 'doubled' });
      return (
        <p>
          {String(isOne(1))}:{doubled()}
        </p>
      );
    });
    try {
      expect(container.textContent).toBe('true:2');
    } finally {
      cleanup();
    }
  });

  it('should name unused state in the development warning', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const { cleanup } = mount(() => {
      state(0, { name: 'neverRead' });
      return <p>x</p>;
    });
    cleanup();
    expect(warn.mock.calls.flat().join(' ')).toContain('"neverRead"');
  });

  it('should name a store in its render-write error', () => {
    expect(() =>
      mount(() => {
        const todos = store({ n: 0 }, { name: 'todos' });
        todos.n = 1;
        return <p>{todos.n}</p>;
      })
    ).toThrow(
      /store "todos" assignment cannot be called during component render/
    );
  });
});
