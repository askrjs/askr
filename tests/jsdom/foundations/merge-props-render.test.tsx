import { describe, expect, it } from 'vite-plus/test';
import { state, type State } from '../../../src';
import { mergeProps } from '../../../src/foundations/utilities/merge-props';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

describe('mergeProps rendered handlers (FOUNDATIONS)', () => {
  it('should keep, clear, and restore the injected handler given undefined and null base handlers', () => {
    const { container, cleanup } = createTestContainer();
    const calls: string[] = [];
    let mode!: State<'undefined' | 'null'>;

    function Primitive(props: { onClick?: (() => void) | null }) {
      const merged = mergeProps(props, {
        onClick: () => calls.push('injected'),
      });
      return <button onClick={merged.onClick}>go</button>;
    }
    function App() {
      mode = state<'undefined' | 'null'>('undefined');
      return <Primitive onClick={mode() === 'null' ? null : undefined} />;
    }

    try {
      createIsland({ root: container, component: App });
      flushScheduler();
      const button = container.querySelector('button')!;

      button.click();
      expect(calls).toEqual(['injected']);

      mode.set('null');
      flushScheduler();
      button.click();
      expect(calls).toEqual(['injected']);

      mode.set('undefined');
      flushScheduler();
      button.click();
      expect(calls).toEqual(['injected', 'injected']);
    } finally {
      cleanup();
    }
  });
});
