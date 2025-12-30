import { describe, it, expect, vi } from 'vitest';
import { pressable } from '@askrjs/askr/foundations';

describe('pressable (FOUNDATIONS)', () => {
  it('should call onPress on click', () => {
    const onPress = vi.fn<() => void>();
    const props = pressable({ onPress });

    props.onClick?.(new MouseEvent('click'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
