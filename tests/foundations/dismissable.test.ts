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
      expect(onDismiss).toHaveBeenCalledWith('escape');
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

  describe('outside pointer dismissal', () => {
    it('should call onDismiss when click is outside', () => {
      const onDismiss = vi.fn();
      const outsideElement = document.createElement('div');
      const containerElement = document.createElement('div');
      const props = dismissable({ onDismiss, node: containerElement });

      props.onPointerDownCapture?.({
        target: outsideElement,
      });

      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(onDismiss).toHaveBeenCalledWith('outside');
    });

    it('should not call onDismiss when click is inside', () => {
      const onDismiss = vi.fn();
      const containerElement = document.createElement('div');
      const insideElement = document.createElement('div');
      containerElement.appendChild(insideElement);
      const props = dismissable({ onDismiss, node: containerElement });

      props.onPointerDownCapture?.({
        target: insideElement,
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should not call onDismiss when node is not provided', () => {
      const onDismiss = vi.fn();
      const outsideElement = document.createElement('div');
      const props = dismissable({ onDismiss, node: null });

      props.onPointerDownCapture?.({
        target: outsideElement,
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should not call onDismiss when target is not a Node', () => {
      const onDismiss = vi.fn();
      const containerElement = document.createElement('div');
      const props = dismissable({ onDismiss, node: containerElement });

      props.onPointerDownCapture?.({
        target: 'not-a-node',
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should not error when onDismiss is undefined', () => {
      const containerElement = document.createElement('div');
      const outsideElement = document.createElement('div');
      const props = dismissable({ node: containerElement });

      expect(() => {
        props.onPointerDownCapture?.({
          target: outsideElement,
        });
      }).not.toThrow();
    });
  });

  describe('disabled state', () => {
    it('should not call onDismiss for Escape when disabled', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss, disabled: true });

      props.onKeyDown?.({
        key: 'Escape',
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should not call onDismiss for outside clicks when disabled', () => {
      const onDismiss = vi.fn();
      const containerElement = document.createElement('div');
      const outsideElement = document.createElement('div');
      const props = dismissable({ onDismiss, disabled: true, node: containerElement });

      props.onPointerDownCapture?.({
        target: outsideElement,
      });

      expect(onDismiss).not.toHaveBeenCalled();
    });

    it('should still provide event handlers when disabled', () => {
      const onDismiss = vi.fn();
      const props = dismissable({ onDismiss, disabled: true });

      // Handlers should exist for composition, just short-circuit
      expect(typeof props.onKeyDown).toBe('function');
      expect(typeof props.onPointerDownCapture).toBe('function');
    });
  });
});
