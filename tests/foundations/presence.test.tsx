import { describe, it, expect } from 'vitest';
import { Presence } from '@askrjs/askr/foundations';

describe('Presence (FOUNDATIONS)', () => {
  it('should return null given present is false', () => {
    expect(Presence({ present: false, children: 'x' })).toBeNull();
  });

  it('should return a Fragment vnode given present is true', () => {
    const out = Presence({ present: true, children: 'x' });
    expect(out).not.toBeNull();
    expect(typeof (out as any).type).toBe('symbol');
    expect((out as any).props.children).toBe('x');
  });
});
