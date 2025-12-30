import { describe, it, expect } from 'vitest';
import { layout } from '@askrjs/askr/foundations';

describe('layout (FOUNDATIONS)', () => {
  it('should pass children through to the layout component', () => {
    let seenChildren: unknown = null;

    const Layout = ({ children }: { children?: unknown }) => {
      seenChildren = children;
      return null;
    };

    layout(Layout)('Hello');
    expect(seenChildren).toBe('Hello');
  });
});
