import { describe, it, expect } from 'vitest';

describe('foundations resolution', () => {
  it('should resolve foundations via package subpath', async () => {
    const foundations: any = await import('@askrjs/askr/foundations');

    expect(typeof foundations.layout).toBe('function');
    expect(typeof foundations.Slot).toBe('function');
    expect(typeof foundations.definePortal).toBe('function');

    expect(typeof foundations.DefaultPortal).toBe('function');
    expect(typeof foundations.DefaultPortal.render).toBe('function');

    expect(typeof foundations.Presence).toBe('function');
    expect(typeof foundations.composeHandlers).toBe('function');
    expect(typeof foundations.mergeProps).toBe('function');
    expect(typeof foundations.composeRefs).toBe('function');
    expect(typeof foundations.useId).toBe('function');
    expect(typeof foundations.controllableState).toBe('function');
  });
});
