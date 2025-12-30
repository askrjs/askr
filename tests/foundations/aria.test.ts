import { describe, it, expect } from 'vitest';
import { ariaExpanded } from '@askrjs/askr/foundations';

describe('aria helpers (FOUNDATIONS)', () => {
  it('should stringify boolean value for aria-expanded', () => {
    expect(ariaExpanded(true)['aria-expanded']).toBe('true');
    expect(ariaExpanded(false)['aria-expanded']).toBe('false');
  });
});
