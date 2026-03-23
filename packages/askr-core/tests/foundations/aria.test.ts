import { describe, it, expect } from 'vitest';
import {
  ariaDisabled,
  ariaExpanded,
  ariaSelected,
} from '@askrjs/askr/foundations';

describe('aria helpers (FOUNDATIONS)', () => {
  describe('ariaDisabled', () => {
    it('should return aria-disabled="true" when disabled is true', () => {
      expect(ariaDisabled(true)).toEqual({ 'aria-disabled': 'true' });
    });

    it('should return empty object when disabled is false', () => {
      expect(ariaDisabled(false)).toEqual({});
    });

    it('should return empty object when disabled is undefined', () => {
      expect(ariaDisabled(undefined)).toEqual({});
    });

    it('should return empty object when called without arguments', () => {
      expect(ariaDisabled()).toEqual({});
    });
  });

  describe('ariaExpanded', () => {
    it('should stringify true to "true"', () => {
      expect(ariaExpanded(true)['aria-expanded']).toBe('true');
    });

    it('should stringify false to "false"', () => {
      expect(ariaExpanded(false)['aria-expanded']).toBe('false');
    });

    it('should return empty object when undefined', () => {
      expect(ariaExpanded(undefined)).toEqual({});
    });

    it('should return empty object when called without arguments', () => {
      expect(ariaExpanded()).toEqual({});
    });
  });

  describe('ariaSelected', () => {
    it('should stringify true to "true"', () => {
      expect(ariaSelected(true)['aria-selected']).toBe('true');
    });

    it('should stringify false to "false"', () => {
      expect(ariaSelected(false)['aria-selected']).toBe('false');
    });

    it('should return empty object when undefined', () => {
      expect(ariaSelected(undefined)).toEqual({});
    });

    it('should return empty object when called without arguments', () => {
      expect(ariaSelected()).toEqual({});
    });
  });
});
