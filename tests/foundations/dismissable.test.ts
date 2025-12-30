import { describe, it, expect, vi } from 'vitest';
import { dismissable } from '@askrjs/askr/foundations';

describe('dismissable (FOUNDATIONS)', () => {
  it('should call onDismiss on Escape keydown', () => {
    const onDismiss = vi.fn<() => void>();
    const props = dismissable({ onDismiss });

    props.onKeyDown?.(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
