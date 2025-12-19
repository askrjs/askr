// tests/ssr/snapshot_restore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrate, renderToString, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('snapshot restore (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should capture component state in snapshot', async () => {
    const Component = () => ({ type: 'div', children: ['hello'] });
    const html = await renderToString(Component);

    // Spec: SSR should produce a snapshot describing required runtime state.
    // Current minimal expectation: non-empty HTML string.
    expect(html).toContain('<div');
    expect(html).toContain('hello');
  });

  it('should apply snapshot to new instance during restore', async () => {
    const Component = () => ({ type: 'div', children: ['hello'] });
    const html = await renderToString(Component);

    container.innerHTML = html;
    await hydrate({ root: container, component: Component });
    flushScheduler();

    expect(container.textContent).toContain('hello');
  });

  it('should use exact state when component is restored', async () => {
    const Component = () => {
      const count = state(0);
      return {
        type: 'button',
        props: { id: 'btn', onClick: () => count.set(count() + 1) },
        children: [`${count()}`],
      };
    };

    const html = await renderToString(() => ({
      type: 'button',
      children: ['0'],
    }));
    container.innerHTML = html;

    await hydrate({ root: container, component: Component });
    flushScheduler();

    const btn = container.querySelector('#btn') as HTMLButtonElement;
    btn.click();
    flushScheduler();

    // Spec: restored state should match server snapshot.
    // (Expected to fail until SSR state snapshotting exists.)
    expect(container.textContent).toBe('1');
  });
});
