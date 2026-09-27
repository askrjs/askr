import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { defineScope, readScope, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

const Theme = defineScope('light');

function Leaf() {
  return <span data-leaf={'true'}>{readScope(Theme)}</span>;
}

function Chain(props: { remaining: number }) {
  return props.remaining === 0 ? (
    <Leaf />
  ) : (
    <Chain remaining={props.remaining - 1} />
  );
}

describe('deep scope revisions', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should re-render a leaf under an unchanged-props chain when an ancestor scope changes', () => {
    let theme!: ReturnType<typeof state<string>>;
    let tick!: ReturnType<typeof state<number>>;
    createIsland({
      root: container,
      component: () => {
        theme = state('light');
        tick = state(0);
        return (
          <section data-tick={String(tick())}>
            <Theme value={theme()}>
              <Chain remaining={300} />
            </Theme>
          </section>
        );
      },
    });
    flushScheduler();
    const leaf = () => container.querySelector('[data-leaf]')?.textContent;
    expect(leaf()).toBe('light');

    // Re-render without a scope change, then change the scope.
    tick.set(1);
    flushScheduler();
    expect(leaf()).toBe('light');
    theme.set('dark');
    flushScheduler();
    expect(leaf()).toBe('dark');
    theme.set('dim');
    flushScheduler();
    expect(leaf()).toBe('dim');
  });

  it('should keep the committed scope value when a render that changed it fails', () => {
    let theme!: ReturnType<typeof state<string>>;
    createIsland({
      root: container,
      component: () => {
        theme = state('light');
        const value = theme();
        return (
          <Theme value={value}>
            <Chain remaining={50} />
            {value === 'broken'
              ? (() => {
                  throw new Error('render failed');
                })()
              : null}
          </Theme>
        );
      },
    });
    flushScheduler();
    const leaf = () => container.querySelector('[data-leaf]')?.textContent;

    theme.set('broken');
    expect(() => flushScheduler()).toThrow('render failed');
    expect(leaf()).toBe('light');

    theme.set('dark');
    flushScheduler();
    expect(leaf()).toBe('dark');
  });
});
