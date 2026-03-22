import { describe, it, expect, vi } from 'vitest';
import { composeHandlers } from '@askrjs/askr/foundations';

describe('composeHandlers (FOUNDATIONS)', () => {
  it('should not call the second handler when default is prevented', () => {
    type TestEvent = {
      defaultPrevented: boolean;
      preventDefault(): void;
    };

    const a = vi.fn((e: TestEvent) => e.preventDefault());
    const b = vi.fn();

    const h = composeHandlers(a, b);

    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    h(event);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(0);
  });

  it('should call the second handler when checkDefaultPrevented is false', () => {
    type TestEvent = {
      defaultPrevented: boolean;
      preventDefault(): void;
    };

    const a = vi.fn((e: TestEvent) => e.preventDefault());
    const b = vi.fn();

    const h = composeHandlers(a, b, { checkDefaultPrevented: false });

    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    h(event);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('should return stable no-op when both handlers are undefined', () => {
    const h1 = composeHandlers(undefined, undefined);
    const h2 = composeHandlers(undefined, undefined);

    expect(h1).toBe(h2);
    expect(() => h1()).not.toThrow();
  });

  it('should return first handler directly when second is undefined', () => {
    const a = vi.fn();
    const h = composeHandlers(a, undefined);

    expect(h).toBe(a);
  });

  it('should return second handler directly when first is undefined', () => {
    const b = vi.fn();
    const h = composeHandlers(undefined, b);

    expect(h).toBe(b);
  });
});
