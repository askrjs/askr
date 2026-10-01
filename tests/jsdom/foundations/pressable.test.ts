import { describe, it, expect, vi } from 'vite-plus/test';
import { pressable } from '../../../src/foundations/interactions/pressable';

describe('pressable (FOUNDATIONS)', () => {
  it.each([false, true])(
    'should honor a captured click cancellation for native-button mode %s',
    (isNativeButton) => {
      const onPress = vi.fn();
      const onBubble = vi.fn();
      const parent = document.createElement('div');
      const host = document.createElement(isNativeButton ? 'button' : 'div');
      const props = pressable({ isNativeButton, onPress });
      parent.addEventListener('click', (event) => event.preventDefault(), true);
      parent.addEventListener('click', onBubble);
      host.addEventListener('click', props.onClick);
      parent.append(host);
      document.body.append(parent);

      try {
        const event = new MouseEvent('click', {
          bubbles: true,
          cancelable: true,
        });
        expect(host.dispatchEvent(event)).toBe(false);
        expect(event.defaultPrevented).toBe(true);
        expect(onPress).not.toHaveBeenCalled();
        expect(onBubble).toHaveBeenCalledTimes(1);
      } finally {
        parent.remove();
      }
    }
  );

  it.each([
    ['keydown', 'Enter'],
    ['keydown', ' '],
    ['keyup', ' '],
  ] as const)(
    'should honor a captured %s cancellation for key %s',
    (type, key) => {
      const onPress = vi.fn();
      const onBubble = vi.fn();
      const parent = document.createElement('div');
      const host = document.createElement('div');
      const props = pressable({ onPress });
      parent.addEventListener(type, (event) => event.preventDefault(), true);
      parent.addEventListener(type, onBubble);
      host.addEventListener(
        type,
        type === 'keydown' ? props.onKeyDown! : props.onKeyUp!
      );
      parent.append(host);
      document.body.append(parent);

      try {
        const event = new KeyboardEvent(type, {
          key,
          bubbles: true,
          cancelable: true,
        });
        const preventDefault = vi.spyOn(event, 'preventDefault');
        expect(host.dispatchEvent(event)).toBe(false);
        expect(onPress).not.toHaveBeenCalled();
        expect(preventDefault).toHaveBeenCalledTimes(1);
        expect(onBubble).toHaveBeenCalledTimes(1);
      } finally {
        parent.remove();
      }
    }
  );

  it.each([
    ['onClick', undefined],
    ['onKeyDown', 'Enter'],
    ['onKeyUp', ' '],
  ] as const)(
    'should preserve disabled propagation suppression for an already cancelled %s',
    (handler, key) => {
      const onPress = vi.fn();
      const props = pressable({ disabled: true, onPress });
      const event = {
        key: key ?? '',
        defaultPrevented: true,
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      };
      props[handler]?.(event);
      expect(onPress).not.toHaveBeenCalled();
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  );

  it.each([
    ['keydown', 'Enter'],
    ['keyup', ' '],
  ] as const)(
    'should deliver one real keyboard press after its own %s default prevention',
    (type, key) => {
      const observed: boolean[] = [];
      const props = pressable({
        onPress: (event) => observed.push(event.defaultPrevented === true),
      });
      const event = new KeyboardEvent(type, { key, cancelable: true });
      if (type === 'keydown') props.onKeyDown?.(event);
      else props.onKeyUp?.(event);
      expect(observed).toEqual([true]);
      expect(event.defaultPrevented).toBe(true);
    }
  );

  it('should suppress press callbacks given pointer cancellation when a press starts on one node and ends elsewhere', () => {
    const onPress = vi.fn();
    const first = document.createElement('div');
    const elsewhere = document.createElement('div');
    const props = pressable({ onPress });
    first.addEventListener('click', props.onClick);
    document.body.append(first, elsewhere);

    try {
      first.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      first.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
      elsewhere.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));

      expect(onPress).not.toHaveBeenCalled();
    } finally {
      first.remove();
      elsewhere.remove();
    }
  });

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
