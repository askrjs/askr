import { describe, it, expect } from 'vite-plus/test';
import { state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import type { JSXElement } from '../../../src/jsx/types';
import { createIsland } from '../../../test-utils/render/create-island';

describe('minimal update preserves siblings', () => {
  it('should not replace unchanged sibling nodes during update', () => {
    const { container, cleanup } = createTestContainer();

    const Component = () => {
      const flag = state(false);
      return (
        <div>
          <span id={'keep'}>{'keep'}</span>
          {flag() ? (
            <span id={'maybe'}>{'A'}</span>
          ) : (
            <span id={'maybe'}>{'B'}</span>
          )}
        </div>
      ) as unknown as JSXElement;
    };

    createIsland({ root: container, component: Component });

    const keepBefore = container.querySelector('#keep') as HTMLElement | null;
    expect(keepBefore).not.toBeNull();

    // Trigger update
    // Need to get state setter - wrap component to expose setter
    let setFlag: (v: boolean) => void = () => {};
    const Controlled = () => {
      const s = state(false);
      setFlag = (v: boolean) => s.set(v);
      return (
        <div>
          <span id={'keep'}>{'keep'}</span>
          {s() ? (
            <span id={'maybe'}>{'A'}</span>
          ) : (
            <span id={'maybe'}>{'B'}</span>
          )}
        </div>
      ) as unknown as JSXElement;
    };

    cleanup();
    const { container: c2, cleanup: cleanup2 } = createTestContainer();
    createIsland({ root: c2, component: Controlled });

    const keepNode = c2.querySelector('#keep') as HTMLElement | null;
    expect(keepNode).not.toBeNull();

    setFlag(true);
    flushScheduler();

    const keepAfter = c2.querySelector('#keep') as HTMLElement | null;
    expect(keepAfter).toBe(keepNode);

    cleanup2();
  });
});
