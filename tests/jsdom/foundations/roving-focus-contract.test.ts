import { describe, expect, it, vi } from 'vite-plus/test';
import { rovingFocus } from '@askrjs/askr/foundations/interactions';

describe('rovingFocus contract helpers (FOUNDATIONS)', () => {
  it('should move to the next enabled item and keep a single tab stop', () => {
    const onNavigate = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 0,
      itemCount: 4,
      loop: true,
      onNavigate,
      isDisabled: (index) => index === 1,
    });

    navigation.container.onKeyDown({
      key: 'ArrowRight',
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(onNavigate).toHaveBeenCalledWith(2);
    expect(navigation.item(0).tabIndex).toBe(0);
    expect(navigation.item(1).tabIndex).toBe(-1);
    expect(navigation.item(2).tabIndex).toBe(-1);
  });

  it('should not recurse forever or navigate when every item is disabled', () => {
    const onNavigate = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();
    const navigation = rovingFocus({
      currentIndex: 0,
      itemCount: 3,
      loop: true,
      onNavigate,
      isDisabled: () => true,
    });

    expect(() => {
      navigation.container.onKeyDown({
        key: 'ArrowRight',
        preventDefault,
        stopPropagation,
      });
    }).not.toThrow();

    expect(onNavigate).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
  });

  it('should preserve roving focus given active-item removal when the collection updates', () => {
    const navigation = rovingFocus({
      currentIndex: 2,
      itemCount: 2,
      onNavigate: vi.fn(),
    });

    expect(navigation.item(0).tabIndex).toBe(0);
    expect(navigation.item(1).tabIndex).toBe(-1);
  });
});
