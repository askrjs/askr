import { describe, it, expect, vi } from 'vitest';
import { composeHandlers } from '@askrjs/askr/foundations';

describe('composeHandlers (FOUNDATIONS)', () => {
  it('should not call the second handler when default is prevented', () => {
    const a = vi.fn((e: any) => e.preventDefault());
    const b = vi.fn();

    const h = composeHandlers(a, b);

    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    h(event as any);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(0);
  });

  it('should call the second handler when checkDefaultPrevented is false', () => {
    const a = vi.fn((e: any) => e.preventDefault());
    const b = vi.fn();

    const h = composeHandlers(a, b, { checkDefaultPrevented: false });

    const event = {
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };

    h(event as any);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
