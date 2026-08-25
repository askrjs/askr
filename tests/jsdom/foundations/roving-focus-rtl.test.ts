import { describe, expect, it, vi } from 'vite-plus/test';
import { rovingFocus } from '@askrjs/askr/foundations/interactions';

describe('rovingFocus RTL arrow-key direction (regression for #357)', () => {
  it('should invert ArrowLeft to move forward and ArrowRight to move backward when computed direction is rtl', () => {
    const container = document.createElement('div');
    container.style.direction = 'rtl';
    document.body.append(container);
    const onNavigate = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 1,
      itemCount: 3,
      onNavigate,
    });

    navigation.container.onKeyDown({
      key: 'ArrowLeft',
      currentTarget: container,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    // In RTL, ArrowLeft moves toward higher indices (visually forward).
    expect(onNavigate).toHaveBeenLastCalledWith(2);

    navigation.container.onKeyDown({
      key: 'ArrowRight',
      currentTarget: container,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    // In RTL, ArrowRight moves toward lower indices (visually backward).
    expect(onNavigate).toHaveBeenLastCalledWith(0);

    container.remove();
  });

  it('should keep default LTR arrow-key direction when no rtl styling is present', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const onNavigate = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 1,
      itemCount: 3,
      onNavigate,
    });

    navigation.container.onKeyDown({
      key: 'ArrowRight',
      currentTarget: container,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });
    expect(onNavigate).toHaveBeenLastCalledWith(2);

    container.remove();
  });
});
