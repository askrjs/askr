import { describe, it, expect } from 'vite-plus/test';

describe('foundations resolution', () => {
  it('should resolve foundations via package subpath', async () => {
    const foundations =
      (await import('@askrjs/askr/foundations')) as unknown as {
        layout: unknown;
        Slot: unknown;
        definePortal: unknown;
        DefaultPortal: unknown;
        Presence: unknown;
      };

    expect(typeof foundations.layout).toBe('function');
    expect(typeof foundations.Slot).toBe('function');
    expect(typeof foundations.definePortal).toBe('function');

    expect(typeof foundations.DefaultPortal).toBe('function');
    expect(
      typeof (foundations.DefaultPortal as { render?: unknown }).render
    ).toBe('function');

    expect(typeof foundations.Presence).toBe('function');
  }, 20_000);
});
