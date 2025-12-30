import { describe, it, expect } from 'vitest';
import { focusable } from '@askrjs/askr/foundations';

describe('focusable (FOUNDATIONS)', () => {
  it('should set tabIndex=-1 given disabled=true', () => {
    const props = focusable({ disabled: true });
    expect(props.tabIndex).toBe(-1);
  });
});
