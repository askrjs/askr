import { describe, it, expect, vi } from 'vitest';
import { pressable } from '@askrjs/askr/foundations';

describe('pressable (FOUNDATIONS)', () => {
  describe('non-native button (default)', () => {
    it('should provide button role and tabIndex', () => {
      const props = pressable({ onPress: vi.fn() });

      expect(props.role).toBe('button');
      expect(props.tabIndex).toBe(0);
      expect(props.onKeyDown).toBeDefined();
      expect(props.onKeyUp).toBeDefined();
    });

    it('should call onPress on click', () => {
      const onPress = vi.fn();
      const props = pressable({ onPress });

      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('should call onPress on Enter keydown', () => {
      const onPress = vi.fn();
      const preventDefault = vi.fn();
      const props = pressable({ onPress });

      props.onKeyDown?.({
        key: 'Enter',
        preventDefault,
        stopPropagation: vi.fn(),
      });

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('should call onPress on Space keyup', () => {
      const onPress = vi.fn();
      const preventDefault = vi.fn();
      const props = pressable({ onPress });

      props.onKeyUp?.({ key: ' ', preventDefault, stopPropagation: vi.fn() });

      expect(onPress).toHaveBeenCalledTimes(1);
      expect(preventDefault).toHaveBeenCalled();
    });

    it('should prevent scroll on Space keydown but not activate', () => {
      const onPress = vi.fn();
      const preventDefault = vi.fn();
      const props = pressable({ onPress });

      props.onKeyDown?.({ key: ' ', preventDefault, stopPropagation: vi.fn() });

      expect(onPress).not.toHaveBeenCalled();
      expect(preventDefault).toHaveBeenCalled();
    });

    it('should not activate on other keys', () => {
      const onPress = vi.fn();
      const props = pressable({ onPress });

      props.onKeyDown?.({
        key: 'a',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      props.onKeyUp?.({
        key: 'Escape',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onPress).not.toHaveBeenCalled();
    });

    describe('disabled state', () => {
      it('should set aria-disabled and tabIndex=-1', () => {
        const props = pressable({ disabled: true, onPress: vi.fn() });

        expect(props['aria-disabled']).toBe('true');
        expect(props.tabIndex).toBe(-1);
        expect(props.disabled).toBeUndefined();
      });

      it('should prevent click activation', () => {
        const onPress = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const props = pressable({ disabled: true, onPress });

        props.onClick({ preventDefault, stopPropagation });

        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
      });

      it('should prevent Enter activation', () => {
        const onPress = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const props = pressable({ disabled: true, onPress });

        props.onKeyDown?.({
          key: 'Enter',
          preventDefault,
          stopPropagation,
        });

        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
      });

      it('should prevent Space activation', () => {
        const onPress = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const props = pressable({ disabled: true, onPress });

        props.onKeyUp?.({
          key: ' ',
          preventDefault,
          stopPropagation,
        });

        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
      });

      it('should prevent scroll on Space keydown when disabled', () => {
        const onPress = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const props = pressable({ disabled: true, onPress });

        props.onKeyDown?.({
          key: ' ',
          preventDefault,
          stopPropagation,
        });

        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
      });
    });
  });

  describe('native button (isNativeButton: true)', () => {
    it('should NOT provide role, tabIndex, or keyboard handlers', () => {
      const props = pressable({ onPress: vi.fn(), isNativeButton: true });

      expect(props.role).toBeUndefined();
      expect(props.tabIndex).toBeUndefined();
      expect(props.onKeyDown).toBeUndefined();
      expect(props.onKeyUp).toBeUndefined();
    });

    it('should call onPress on click', () => {
      const onPress = vi.fn();
      const props = pressable({ onPress, isNativeButton: true });

      props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(onPress).toHaveBeenCalledTimes(1);
    });

    describe('disabled state', () => {
      it('should set both disabled and aria-disabled', () => {
        const props = pressable({
          disabled: true,
          onPress: vi.fn(),
          isNativeButton: true,
        });

        expect(props.disabled).toBe(true);
        expect(props['aria-disabled']).toBe('true');
      });

      it('should prevent click activation (defense in depth)', () => {
        const onPress = vi.fn();
        const preventDefault = vi.fn();
        const stopPropagation = vi.fn();
        const props = pressable({
          disabled: true,
          onPress,
          isNativeButton: true,
        });

        props.onClick({ preventDefault, stopPropagation });

        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalled();
        expect(stopPropagation).toHaveBeenCalled();
      });
    });
  });

  describe('onPress is optional', () => {
    it('should not error when onPress is undefined (non-native)', () => {
      const props = pressable({});

      expect(() => {
        props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
        props.onKeyDown?.({
          key: 'Enter',
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
        props.onKeyUp?.({
          key: ' ',
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      }).not.toThrow();
    });

    it('should not error when onPress is undefined (native)', () => {
      const props = pressable({ isNativeButton: true });

      expect(() => {
        props.onClick({ preventDefault: vi.fn(), stopPropagation: vi.fn() });
      }).not.toThrow();
    });
  });
});
