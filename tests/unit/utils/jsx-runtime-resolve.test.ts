import { describe, it, expect } from 'vite-plus/test';

describe('jsx runtime resolution', () => {
  it('should resolve runtime via package subpath', async () => {
    const runtime = await import('@askrjs/askr/jsx-runtime');
    expect(typeof runtime.jsx).toBe('function');
    expect(typeof runtime.jsxs).toBe('function');
    expect(!!runtime.Fragment).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(runtime, 'ELEMENT_TYPE')).toBe(
      false
    );
  });
});
