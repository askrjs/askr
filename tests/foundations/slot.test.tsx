import { describe, it, expect } from 'vitest';
import { Slot } from '@askrjs/askr/foundations';

type VNodeShape = { type: unknown; props: Record<string, unknown> };

describe('Slot (FOUNDATIONS)', () => {
  it('should clone child element props given asChild', () => {
    const child = <div data-a="1" />;
    const out = Slot({ asChild: true, children: child, 'data-b': '2' });

    expect(out).not.toBeNull();
    const vnode = out as unknown as VNodeShape;
    expect(vnode.type).toBe('div');
    expect(vnode.props['data-a']).toBe('1');
    expect(vnode.props['data-b']).toBe('2');
  });

  it('should return a Fragment vnode given asChild is not set', () => {
    const out = Slot({ children: 'x' });
    expect(out).not.toBeNull();
    const vnode = out as unknown as VNodeShape;
    expect(typeof vnode.type).toBe('symbol');
    expect(vnode.props.children).toBe('x');
  });
});
