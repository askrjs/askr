import { describe, expect, it } from 'vitest';
import {
  FRAGMENT,
  PORTAL,
  TEXT,
  collectDom,
  firstDom,
  type FragmentNode,
  type RNode,
  type TextNode,
} from '../../../src/core/dom/tree';

describe('rendered tree DOM traversal', () => {
  it('should find DOM through deep transparent wrappers without overflowing', () => {
    const dom = {} as Text;
    let root: RNode = {
      kind: TEXT,
      parent: null,
      key: undefined,
      node: dom,
      text: 'leaf',
    } satisfies TextNode;
    for (let i = 0; i < 20_000; i++) {
      const parent: FragmentNode = {
        kind: FRAGMENT,
        parent: null,
        key: undefined,
        children: [root],
      };
      root.parent = parent;
      root = parent;
    }

    expect(firstDom(root)).toBe(dom);
    expect(collectDom(root)).toEqual([dom]);
  });

  it('should skip portal content while preserving sibling order', () => {
    const first = {} as Text;
    const second = {} as Text;
    const portal = {
      kind: PORTAL,
      parent: null,
      key: undefined,
      target: {} as Element,
      children: [
        {
          kind: TEXT,
          parent: null,
          key: undefined,
          node: {} as Text,
          text: 'portal',
        } satisfies TextNode,
      ],
    } as RNode;
    const root: FragmentNode = {
      kind: FRAGMENT,
      parent: null,
      key: undefined,
      children: [
        portal,
        {
          kind: TEXT,
          parent: null,
          key: undefined,
          node: first,
          text: 'first',
        },
        {
          kind: TEXT,
          parent: null,
          key: undefined,
          node: second,
          text: 'second',
        },
      ],
    };

    expect(firstDom(root)).toBe(first);
    expect(collectDom(root)).toEqual([first, second]);
  });
});
