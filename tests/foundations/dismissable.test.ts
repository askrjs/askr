import { describe, it, expect, vi } from 'vitest';
import { dismissable } from '@askrjs/askr/foundations';

describe('dismissable (FOUNDATIONS)', () => {
  describe('keyboard dismissal', () => {
    it('should call onDismiss on Escape keydown', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss });

      props.onKeyDown?.({
        key: 'Escape',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should prevent default and stop propagation on Escape', () => {
      const onDismiss = vi.fn();
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const props = dismissable({ onDismiss });

      props.onKeyDown?.({
        key: 'Escape',
        preventDefault,
        stopPropagation,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
    });

    it('should not call onDismiss on other keys', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss });

      props.onKeyDown?.({
        key: 'Enter',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      props.onKeyDown?.({
        key: 'Space',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      props.onKeyDown?.({
        key: 'a',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should not error when onDismiss is undefined', () => {
      const props = dismissable({});

      expect(() => {
        props.onKeyDown?.({
          key: 'Escape',
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('outside click dismissal', () => {
    it('should call onDismiss when click is outside', () => {
      const onDismiss = vi.fn();
      const { outsideListener } = dismissable({ onDismiss });
      const isInside = vi.fn(() => false);
      const handler = outsideListener?.(isInside);

      handler?.({
        target: 'some-element',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('should prevent default and stop propagation on outside click', () => {
      const onDismiss = vi.fn();
      const preventDefault = vi.fn();
      const stopPropagation = vi.fn();
      const { outsideListener } = dismissable({ onDismiss });
      const isInside = vi.fn(() => false);
      const handler = outsideListener?.(isInside);

      handler?.({
        target: 'some-element',
        preventDefault,
        stopPropagation,
      });

      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(stopPropagation).toHaveBeenCalledTimes(1);
    });

    it('should not call onDismiss when click is inside', () => {
      const onDismiss = vi.fn();
      const { outsideListener } = dismissable({ onDismiss });
      const isInside = vi.fn(() => true);
      const handler = outsideListener?.(isInside);

      handler?.({
        target: 'some-element',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should call isInside predicate with event target', () => {
      const onDismiss = vi.fn();
      const { outsideListener } = dismissable({ onDismiss });
      const isInside = vi.fn(() => false);
      const handler = outsideListener?.(isInside);
      const target = { id: 'test-target' };

      handler?.({ target, preventDefault: vi.fn(), stopPropagation: vi.fn() });

      expect(isInside).toHaveBeenCalledWith(target);
    });

    it('should not error when onDismiss is undefined', () => {
      const { outsideListener } = dismissable({});
      const isInside = vi.fn(() => false);
      const handler = outsideListener?.(isInside);

      expect(() => {
        handler?.({
          target: 'some-element',
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('disabled state', () => {
    it('should not provide onKeyDown when disabled', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss, disabled: true });

      expect(props.onKeyDown).toBeUndefined();
    });

    it('should not provide outsideListener when disabled', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss, disabled: true });

      expect(props.outsideListener).toBeUndefined();
    });
  });
});
