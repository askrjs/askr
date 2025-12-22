import { describe, it, expect } from 'vitest';
import { createIsland, createSPA } from '../../src/index';
import { createTestContainer } from '../helpers/test_renderer';

describe('startup API guards', () => {
  it('should throw when routes missing', async () => {
    const { container, cleanup } = createTestContainer();
    try {
      // @ts-ignore runtime test: missing routes should throw
      await expect(
        (createSPA as unknown as (cfg: unknown) => Promise<void>)({
          root: container,
        })
      ).rejects.toThrow(/createSPA requires a route table/i);
    } finally {
      cleanup();
    }
  });

  it('should reject routes in config at runtime', () => {
    const { container, cleanup } = createTestContainer();
    try {
      // @ts-ignore passing routes to island should be a type error; at runtime, ensure it throws
      expect(() =>
        (createIsland as unknown as (cfg: unknown) => void)({
          root: container,
          component: () => ({ type: 'div' }),
          routes: [],
        })
      ).toThrow();
    } finally {
      cleanup();
    }
  });
});
