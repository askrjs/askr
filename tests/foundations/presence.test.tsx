import { describe, it, expect, vi } from 'vitest';
import { Presence } from '@askrjs/askr/foundations';

type VNodeShape = {
  type: unknown;
  props: Record<string, unknown>;
  key?: unknown;
};

describe('Presence (FOUNDATIONS)', () => {
  describe('boolean present', () => {
    it('should return null when present is false', () => {
      expect(Presence({ present: false, children: 'x' })).toBeNull();
    });

    it('should return a Fragment vnode when present is true', () => {
      const out = Presence({ present: true, children: 'x' });
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(typeof vnode.type).toBe('symbol');
      expect(vnode.props.children).toBe('x');
    });

    it('should include key property', () => {
      const out = Presence({ present: true, children: 'x' });
      const vnode = out as unknown as VNodeShape;
      expect(vnode).toHaveProperty('key');
      expect(vnode.key).toBeNull();
    });

    it('should handle undefined children', () => {
      const out = Presence({ present: true });
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBeUndefined();
    });

    it('should handle null children', () => {
      const out = Presence({ present: true, children: null });
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBeNull();
    });

    it('should handle array children', () => {
      const children = ['a', 'b', 'c'];
      const out = Presence({ present: true, children });
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBe(children);
    });
  });

  describe('function present', () => {
    it('should call function and return null when it returns false', () => {
      const presentFn = vi.fn(() => false);
      const out = Presence({ present: presentFn, children: 'x' });

      expect(presentFn).toHaveBeenCalledTimes(1);
      expect(out).toBeNull();
    });

    it('should call function and return Fragment when it returns true', () => {
      const presentFn = vi.fn(() => true);
      const out = Presence({ present: presentFn, children: 'x' });

      expect(presentFn).toHaveBeenCalledTimes(1);
      expect(out).not.toBeNull();
      const vnode = out as unknown as VNodeShape;
      expect(vnode.props.children).toBe('x');
    });

    it('should treat falsy function return as false', () => {
      expect(Presence({ present: () => false, children: 'x' })).toBeNull();
      expect(Presence({ present: () => false, children: 'x' })).toBeNull();
      expect(Presence({ present: () => false, children: 'x' })).toBeNull();
      expect(Presence({ present: () => false, children: 'x' })).toBeNull();
    });

    it('should treat truthy function return as true', () => {
      expect(Presence({ present: () => true, children: 'x' })).not.toBeNull();
      expect(Presence({ present: () => true, children: 'x' })).not.toBeNull();
      expect(Presence({ present: () => true, children: 'x' })).not.toBeNull();
      expect(Presence({ present: () => true, children: 'x' })).not.toBeNull();
    });
  });
});
