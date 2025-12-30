import { describe, it, expect } from 'vitest';
import { Presence } from '@askrjs/askr/foundations';

type VNodeShape = { type: unknown; props: Record<string, unknown> };

describe('Presence (FOUNDATIONS)', () => {
  it('should return null given present is false', () => {
    expect(Presence({ present: false, children: 'x' })).toBeNull();
  });

  it('should return a Fragment vnode given present is true', () => {
    const out = Presence({ present: true, children: 'x' });
    expect(out).not.toBeNull();
    const vnode = out as unknown as VNodeShape;
    expect(typeof vnode.type).toBe('symbol');
    expect(vnode.props.children).toBe('x');
  });
});
