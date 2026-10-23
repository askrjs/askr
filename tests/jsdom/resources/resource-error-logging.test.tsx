import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { resource } from '../../../src/resources';
import { logger } from '../../../src/common/logger';
import { createIsland } from '../../../test-utils/render/create-island';
import {
  createTestContainer,
  flushScheduler,
} from '../../../test-utils/render/test-renderer';

const settle = async () => {
  for (let i = 0; i < 4; i++) {
    await Promise.resolve();
    flushScheduler();
  }
};

async function mountFailing(readError: boolean): Promise<string> {
  const { container, cleanup } = createTestContainer();
  try {
    createIsland({
      root: container,
      component: () => {
        const data = resource(() => Promise.reject(new Error('boom')));
        return <p>{readError ? (data.error?.message ?? 'none') : 'idle'}</p>;
      },
    });
    flushScheduler();
    await settle();
    return container.textContent ?? '';
  } finally {
    cleanup();
  }
}

describe('resource error logging', () => {
  const previous = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = previous;
    vi.restoreAllMocks();
  });

  it('should log an async resource failure in development', async () => {
    process.env.NODE_ENV = 'development';
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(await mountFailing(true)).toBe('boom');
    expect(spy).toHaveBeenCalled();
  });

  it('should never log an async resource failure in production', async () => {
    process.env.NODE_ENV = 'production';
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    expect(await mountFailing(true)).toBe('boom');
    expect(await mountFailing(false)).toBe('idle');
    expect(spy).not.toHaveBeenCalled();
  });
});
