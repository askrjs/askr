import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test';
import { createElement, state } from '../../../src/index';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';
import { createIsland } from '../../../test-utils/render/create-island';

function Row(props: { label: string }) {
  return <li>{props.label}</li>;
}

describe('createElement keys', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
  });

  afterEach(() => cleanup());

  it('should key rows built with a key after a spread so reordering keeps their nodes', () => {
    let order!: ReturnType<typeof state<string[]>>;
    createIsland({
      root: container,
      component: () => {
        order = state(['a', 'b', 'c']);
        return (
          <ul>
            {order().map((id) =>
              createElement(Row as never, { ...{ label: id }, key: id })
            )}
          </ul>
        );
      },
    });
    flushScheduler();
    const [a, b, c] = Array.from(container.querySelectorAll('li'));

    order.set(['c', 'a', 'b']);
    flushScheduler();
    expect(Array.from(container.querySelectorAll('li'))).toEqual([c, a, b]);
    expect(container.textContent).toBe('cab');
  });
});
