import { describe, it, expect, vi } from 'vite-plus/test';
import { composeRefs } from '../../../src/foundations/utilities/compose-ref';

describe('composeRefs (FOUNDATIONS)', () => {
  it('should call all composed callback refs', () => {
    const a = vi.fn<(value: { id: string } | null) => void>();
    const b = vi.fn<(value: { id: string } | null) => void>();

    const ref = composeRefs(a, b);
    const value = { id: 'x' };

    ref(value);

    expect(a).toHaveBeenCalledWith(value);
    expect(b).toHaveBeenCalledWith(value);
  });

  it('should compose refs and handlers given Slot or asChild composition when the child rerenders and unmounts', () => {
    const first = vi.fn();
    const second = vi.fn();
    const ref = composeRefs(first, second);
    const node = { id: 'child' };
    ref(node);
    ref(null);
    expect(first.mock.calls).toEqual([[node], [null]]);
    expect(second.mock.calls).toEqual([[node], [null]]);
  });

  it('should continue composing after a readonly object ref rejects assignment', () => {
    const readonlyRef = {} as { current: { id: string } | null };
    Object.defineProperty(readonlyRef, 'current', {
      value: null,
      writable: false,
      configurable: true,
    });
    const callback = vi.fn();
    const value = { id: 'reachable' };

    expect(() => composeRefs(readonlyRef, callback)(value)).not.toThrow();
    expect(readonlyRef.current).toBeNull();
    expect(callback).toHaveBeenCalledWith(value);
  });
});
