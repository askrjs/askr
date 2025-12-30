import { describe, it, expect } from 'vitest';
import { Slot } from '@askrjs/askr/foundations';

type VNodeShape = { type: unknown; props: Record<string, unknown>; key?: unknown };

describe('Slot (FOUNDATIONS)', () => {
  describe('asChild mode', () => {
    it('should clone child element props', () => {
      const child = <div data-a="1" />;
      const out = Slot({ asChild: true, children: child, 'data-b': '2' });

      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.type).toBe('div');
      expect(vnode.props['data-a']).toBe('1');
      expect(vnode.props['data-b']).toBe('2');
    });

    it('should merge multiple props into child', () => {
      const child = <button type="button" />;
      const out = Slot({
        asChild: true,
        children: child,
        className: 'btn',
        disabled: true,
      });

      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.type).toBe('button');
      expect(vnode.props.className).toBe('btn');
      expect(vnode.props.disabled).toBe(true);
    });

    it('should override child props with slot props', () => {
      const child = <div className="old" />;
      const out = Slot({ asChild: true, children: child, className: 'new' });

      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.className).toBe('new');
    });

    it('should return null for non-element children', () => {
      // Type cast to bypass type checking for test purposes
      const out = Slot({ asChild: true, children: 'text' as any });
      expect(out).toBeNull();
    });
  });

  describe('fragment mode (default)', () => {
    it('should return a Fragment vnode when asChild is not set', () => {
      const out = Slot({ children: 'x' });
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(typeof vnode.type).toBe('symbol');
      expect(vnode.props.children).toBe('x');
    });

    it('should include key property', () => {
      const out = Slot({ children: 'x' });
      const vnode = out as unknown as VNodeShape;
      expect(vnode).toHaveProperty('key');
      expect(vnode.key).toBeNull();
    });

    it('should handle undefined children', () => {
      const out = Slot({});
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBeUndefined();
    });

    it('should handle complex children', () => {
      const children = [<div key="1" />, <span key="2" />];
      const out = Slot({ children });
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBe(children);
    });
  });
});
