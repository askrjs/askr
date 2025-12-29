import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSPA } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test-renderer';
import { navigate } from '../../src/router/navigate';

function layout<TChildren>(
  Layout: (props: { children?: TChildren }) => unknown
): (children?: TChildren) => unknown {
  return (children?: TChildren) => Layout({ children });
}

describe('layout helper (ROUTER)', () => {
  let container: HTMLElement;
  let cleanup: () => void;

  beforeEach(() => {
    const t = createTestContainer();
    container = t.container;
    cleanup = t.cleanup;
  });

  afterEach(() => {
    cleanup();
  });

  it('should pass children to a layout component', async () => {
    // Layout defined as a component that accepts children and returns a vnode-like object
    const ParentLayout = ({ children }: { children?: unknown }) => ({
      type: 'div',
      props: { class: 'parent' },
      children: Array.isArray(children) ? children : children ? [children] : [],
    });
    const parent = layout(ParentLayout);

    const routes = [
      {
        path: '/p',
        handler: () =>
          parent({ type: 'div', props: { class: 'child' }, children: ['C'] }),
      },
    ];

    await createSPA({ root: container, routes });

    navigate('/p');
    await flushScheduler();

    const layoutEl = container.querySelector('.parent');
    const childEl = container.querySelector('.child');

    expect(layoutEl).not.toBeNull();
    expect(childEl?.textContent).toBe('C');
  });
});
