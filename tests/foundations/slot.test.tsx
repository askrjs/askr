import { describe, it, expect } from 'vitest';
import { Slot } from '@askrjs/askr/foundations';

describe('Slot (FOUNDATIONS)', () => {
  it('should clone child element props given asChild', () => {
    const child = <div data-a="1" />;
    const out = Slot({ asChild: true, children: child, 'data-b': '2' });

    expect(out).not.toBeNull();
    expect((out as any).type).toBe('div');
    expect((out as any).props['data-a']).toBe('1');
    expect((out as any).props['data-b']).toBe('2');
  });

  it('should return a Fragment vnode given asChild is not set', () => {
    const out = Slot({ children: 'x' });
    expect(out).not.toBeNull();
    expect(typeof (out as any).type).toBe('symbol');
    expect((out as any).props.children).toBe('x');
  });
});
