import { describe, it, expect, vi } from 'vitest';
import { composeRefs } from '@askrjs/askr/foundations';

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
});
