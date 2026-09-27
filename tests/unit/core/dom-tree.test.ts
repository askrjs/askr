import { describe, expect, it } from 'vitest';
import {
  FRAGMENT,
  TEXT,
  collectDom,
  firstDom,
  nextDomAfter,
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
    const leaf = root;
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

    const sibling = {} as Text;
    const outer: FragmentNode = {
      kind: FRAGMENT,
      parent: null,
      key: undefined,
      children: [
        root,
        {
          kind: TEXT,
          parent: null,
          key: undefined,
          node: sibling,
          text: 'sibling',
        },
      ],
    };
    root.parent = outer;

    expect(firstDom(outer)).toBe(dom);
    expect(collectDom(outer)).toEqual([dom, sibling]);
    expect(nextDomAfter(leaf)).toBe(sibling);
  });
});
