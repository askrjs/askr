import { describe, it, expect } from 'vitest';
import { layout } from '@askrjs/askr/foundations';

describe('layout (FOUNDATIONS)', () => {
  it('should pass children as first argument', () => {
    let seenChildren: unknown = null;

    const Layout = ({ children }: { children?: unknown }) => {
      seenChildren = children;
      return null;
    };

    layout(Layout)('Hello');
    expect(seenChildren).toBe('Hello');
  });

  it('should pass props as second argument', () => {
    let seenProps: unknown = null;

    const Layout = (props: { title?: string; children?: unknown }) => {
      seenProps = props;
      return null;
    };

    layout(Layout)('content', { title: 'Page' });
    expect(seenProps).toEqual({ title: 'Page', children: 'content' });
  });

  it('should merge children and props', () => {
    const Layout = (props: { id?: string; children?: unknown }) => props;

    const result = layout(Layout)('child-content', { id: 'main' });
    expect(result).toEqual({ id: 'main', children: 'child-content' });
  });

  it('should handle no props', () => {
    const Layout = ({ children }: { children?: unknown }) => ({ children });

    const result = layout(Layout)('content');
    expect(result).toEqual({ children: 'content' });
  });

  it('should handle no children', () => {
    const Layout = (props: { title?: string; children?: unknown }) => props;

    const result = layout(Layout)(undefined, { title: 'Empty' });
    expect(result).toEqual({ title: 'Empty', children: undefined });
  });

  it('should handle complex children', () => {
    const children = [{ type: 'div' }, { type: 'span' }];
    const Layout = ({ children }: { children?: unknown }) => ({ children });

    const result = layout(Layout)(children);
    expect(result).toEqual({ children });
  });
});
