import { describe, it, expect } from 'vitest';
import { focusable } from '@askrjs/askr/foundations';

describe('focusable (FOUNDATIONS)', () => {
  describe('enabled state (default)', () => {
    it('should set tabIndex=0 by default', () => {
      const props = focusable({});
      expect(props.tabIndex).toBe(0);
    });

    it('should not set aria-disabled when enabled', () => {
      const props = focusable({ disabled: false });
      expect(props['aria-disabled']).toBeUndefined();
    });

    it('should use custom tabIndex when provided', () => {
      const props = focusable({ tabIndex: 5 });
      expect(props.tabIndex).toBe(5);
    });

    it('should allow tabIndex=-1 when explicitly set', () => {
      const props = focusable({ tabIndex: -1 });
      expect(props.tabIndex).toBe(-1);
    });
  });

  describe('disabled state', () => {
    it('should set tabIndex=-1 when disabled', () => {
      const props = focusable({ disabled: true });
      expect(props.tabIndex).toBe(-1);
    });

    it('should set aria-disabled when disabled', () => {
      const props = focusable({ disabled: true });
      expect(props['aria-disabled']).toBe('true');
    });

    it('should override custom tabIndex when disabled', () => {
      const props = focusable({ disabled: true, tabIndex: 5 });
      expect(props.tabIndex).toBe(-1);
    });
  });
});
