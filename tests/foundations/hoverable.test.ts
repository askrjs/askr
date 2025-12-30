import { describe, it, expect, vi } from 'vitest';
import { hoverable } from '@askrjs/askr/foundations';

describe('hoverable (FOUNDATIONS)', () => {
  it('should call onEnter on pointerenter', () => {
    const onEnter = vi.fn<(e: Event) => void>();
    const props = hoverable({ onEnter });

    const event = new Event('pointerenter');
    props.onPointerEnter?.(event);

    expect(onEnter).toHaveBeenCalledTimes(1);
  });
});
