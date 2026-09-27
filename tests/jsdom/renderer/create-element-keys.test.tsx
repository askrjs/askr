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
              createElement(Row, { ...{ label: id }, key: id })
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

  it('should render a key written after a spread through the real JSX transform', () => {
    const warnings: unknown[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args);
    function Item(props: { label: string; children?: unknown }) {
      // Development transforms must not leak their __self/__source props.
      expect(Object.keys(props).sort()).toEqual(['children', 'label']);
      return <li title={props.label}>{props.children}</li>;
    }
    let order!: ReturnType<typeof state<string[]>>;
    try {
      createIsland({
        root: container,
        component: () => {
          order = state(['a', 'b']);
          return (
            <ul>
              {order().map((id) => {
                const rest = { label: id };
                return (
                  <Item {...rest} key={id}>
                    <b>{id}</b>
                    <i>{'!'}</i>
                  </Item>
                );
              })}
            </ul>
          );
        },
      });
      flushScheduler();
      const [a, b] = Array.from(container.querySelectorAll('li'));
      expect(a?.getAttribute('__source')).toBeNull();

      order.set(['b', 'a']);
      flushScheduler();
      expect(Array.from(container.querySelectorAll('li'))).toEqual([b, a]);
      expect(container.textContent).toBe('b!a!');
      expect(
        warnings.filter((entry) => String(entry).includes('Missing keys'))
      ).toEqual([]);
    } finally {
      console.warn = warn;
    }
  });
});
