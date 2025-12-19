// tests/ssr/hydration_mismatch.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { hydrate } from '../../src/index';
import { createTestContainer, flushScheduler } from '../helpers/test_renderer';

describe('hydration mismatch (SSR)', () => {
  let { container, cleanup } = createTestContainer();
  beforeEach(() => ({ container, cleanup } = createTestContainer()));
  afterEach(() => cleanup());

  it('should re-render client when server HTML text differs', async () => {
    container.innerHTML = '<div>server</div>';
    const Component = () => ({ type: 'div', children: ['client'] });

    await hydrate({ root: container, component: Component });
    flushScheduler();

    // Spec: mismatch should be detected and handled.
    expect(container.textContent).toBe('client');
  });

  it('should re-render client when server HTML structure differs', async () => {
    container.innerHTML = '<span>server</span>';
    const Component = () => ({ type: 'div', children: ['client'] });

    await hydrate({ root: container, component: Component });
    flushScheduler();

    expect(container.querySelector('div')).not.toBeNull();
    expect(container.querySelector('span')).toBeNull();
  });

  it('should warn in dev mode when mismatch occurs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    container.innerHTML = '<div>server</div>';

    const Component = () => ({ type: 'div', children: ['client'] });
    await hydrate({ root: container, component: Component });
    flushScheduler();

    // Spec: mismatch should warn in dev.
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
