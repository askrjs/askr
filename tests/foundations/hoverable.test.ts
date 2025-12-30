import { describe, it, expect, vi } from 'vitest';
import { hoverable } from '@askrjs/askr/foundations';

describe('hoverable (FOUNDATIONS)', () => {
  describe('pointer enter', () => {
    it('should call onEnter on pointerenter', () => {
      const onEnter = vi.fn();
      const props = hoverable({ onEnter });

      props.onPointerEnter?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onEnter).toHaveBeenCalledTimes(1);
    });

    it('should pass event to onEnter', () => {
      const onEnter = vi.fn();
      const props = hoverable({ onEnter });
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };

      props.onPointerEnter?.(event);

      expect(onEnter).toHaveBeenCalledWith(event);
    });

    it('should not error when onEnter is undefined', () => {
      const props = hoverable({});

      expect(() => {
        props.onPointerEnter?.({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('pointer leave', () => {
    it('should call onLeave on pointerleave', () => {
      const onLeave = vi.fn();
      const props = hoverable({ onLeave });

      props.onPointerLeave?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onLeave).toHaveBeenCalledTimes(1);
    });

    it('should pass event to onLeave', () => {
      const onLeave = vi.fn();
      const props = hoverable({ onLeave });
      const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };

      props.onPointerLeave?.(event);

      expect(onLeave).toHaveBeenCalledWith(event);
    });

    it('should not error when onLeave is undefined', () => {
      const props = hoverable({});

      expect(() => {
        props.onPointerLeave?.({
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
        });
      }).not.toThrow();
    });
  });

  describe('both handlers', () => {
    it('should call both onEnter and onLeave', () => {
      const onEnter = vi.fn();
      const onLeave = vi.fn();
      const props = hoverable({ onEnter, onLeave });

      props.onPointerEnter?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });
      props.onPointerLeave?.({
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onEnter).toHaveBeenCalledTimes(1);
      expect(onLeave).toHaveBeenCalledTimes(1);
    });
  });

  describe('disabled state', () => {
    it('should not provide onPointerEnter when disabled', () => {
      const onEnter = vi.fn();
      const props = hoverable({ onEnter, disabled: true });

      expect(props.onPointerEnter).toBeUndefined();
    });

    it('should not provide onPointerLeave when disabled', () => {
      const onLeave = vi.fn();
      const props = hoverable({ onLeave, disabled: true });

      expect(props.onPointerLeave).toBeUndefined();
    });

    it('should not provide any handlers when disabled', () => {
      const props = hoverable({
        onEnter: vi.fn(),
        onLeave: vi.fn(),
        disabled: true,
      });

      expect(props.onPointerEnter).toBeUndefined();
      expect(props.onPointerLeave).toBeUndefined();
    });
  });
});
