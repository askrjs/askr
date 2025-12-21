import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createSPA, navigate } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';
import { layout } from '../../src/index';

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

  it('should support zero-arg factory passed to layout()', async () => {
    // Zero-arg factory that returns a layout element
    const ParentLayout = () => ({
      type: 'div',
      props: { class: 'parent' },
      children: [],
    });
    const parent = layout(() => ParentLayout());

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
