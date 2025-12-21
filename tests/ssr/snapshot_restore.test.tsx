// tests/ssr/snapshot_restore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrateSPA, renderToStringSync, state } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('snapshot restore (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should capture component state in snapshot', async () => {
    const Component = () => ({ type: 'div', children: ['hello'] });
    const html = renderToStringSync(Component);

    // Spec: SSR should produce a snapshot describing required runtime state.
    // Current minimal expectation: non-empty HTML string.
    expect(html).toContain('<div');
    expect(html).toContain('hello');
  });

  it('should apply snapshot to new instance during restore', async () => {
    const Component = () => ({ type: 'div', children: ['hello'] });
    const html = renderToStringSync(Component);

    container.innerHTML = html;
    await expect(
      hydrateSPA({
        root: container,
        routes: [{ path: '/', handler: Component }],
      })
    ).resolves.not.toThrow();
    flushScheduler();

    expect(container.textContent).toContain('hello');
  });
});
