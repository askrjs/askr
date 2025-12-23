import { describe, it, expect } from 'vitest';

describe('jsx runtime resolution', () => {
  it('should resolve runtime via package subpath', async () => {
    const runtime = await import('@askrjs/askr/jsx-runtime');
    expect(typeof runtime.jsx).toBe('function');
    expect(typeof runtime.jsxs).toBe('function');
    expect(!!runtime.Fragment).toBe(true);
  });
});
