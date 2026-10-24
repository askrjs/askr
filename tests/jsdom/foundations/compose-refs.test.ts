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

  it('should null object refs on detach when a callback ref returned a cleanup', () => {
    const released = vi.fn();
    const object: { current: { id: string } | null } = { current: null };
    const node = { id: 'x' };

    const detach = composeRefs<{ id: string }>(() => released, object)(node);

    expect(object.current).toBe(node);
    expect(typeof detach).toBe('function');
    detach!();
    expect(released).toHaveBeenCalledTimes(1);
    expect(object.current).toBeNull();
  });

  it('should run the cleanups already returned when a later ref throws on attach', () => {
    const released = vi.fn();
    const object: { current: { id: string } | null } = { current: null };
    const failure = new Error('nope');
    const node = { id: 'x' };
    const ref = composeRefs<{ id: string }>(
      () => released,
      object,
      () => {
        throw failure;
      }
    );

    expect(() => ref(node)).toThrow(AggregateError);
    // A throwing attach returns no cleanup, so the one collected runs now.
    expect(released).toHaveBeenCalledTimes(1);
    // Every ref is still applied; the detach that follows gives them null.
    expect(object.current).toBe(node);
    expect(() => ref(null)).toThrow(AggregateError);
    expect(object.current).toBeNull();
  });
});
