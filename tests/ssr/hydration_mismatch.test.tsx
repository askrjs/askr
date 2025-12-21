// tests/ssr/hydration_mismatch.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { hydrateSPA } from '../../src/index';
import { createTestContainer } from '../helpers/test_renderer';

describe('hydration mismatch (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should re-render client when server HTML text differs', async () => {
    container.innerHTML = '<div>server</div>';
    const Component = () => ({ type: 'div', children: ['client'] });

    await expect(
      hydrateSPA({
        root: container,
        routes: [{ path: '/', handler: Component }],
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });

  it('should re-render client when server HTML structure differs', async () => {
    container.innerHTML = '<span>server</span>';
    const Component = () => ({ type: 'div', children: ['client'] });

    await expect(
      hydrateSPA({
        root: container,
        routes: [{ path: '/', handler: Component }],
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });

  it('should warn in dev mode when mismatch occurs', async () => {
    container.innerHTML = '<div>server</div>';

    const Component = () => ({ type: 'div', children: ['client'] });
    await expect(
      hydrateSPA({
        root: container,
        routes: [{ path: '/', handler: Component }],
      })
    ).rejects.toThrow(/Hydration mismatch/i);
  });
});
