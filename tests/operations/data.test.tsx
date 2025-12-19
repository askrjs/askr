import { describe, it, expect } from 'vitest';

describe('data() deprecated', () => {
  it('should not be exported as a public API', async () => {
    const idx = await import('../../src/index');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((idx as any).data).toBeUndefined();
  });
});
