/**
 * SSR render isolated benchmarks (attrs + escaping)
 *
 * Goal: create stable, renderer-focused workloads for:
 * - attribute rendering (`renderAttrs`)
 * - text/attr escaping (`escapeText`/`escapeAttr`)
 *
 * These benches reuse prebuilt trees to reduce GC variance.
 */

import { bench, describe } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import type { VNode } from '../../src/ssr';
import type { JSXElement } from '../../src/common/jsx';

type SSRNode = VNode | JSXElement | string | number | null;

type VNodeLike = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

const ITERS = 20;
const COUNT = 2000;

function renderTreeToString(tree: VNodeLike): string {
  return renderToStringSync(() => tree as unknown as SSRNode);
}

function buildAttrsHeavyTree(count: number): VNodeLike {
  const nodes = new Array<VNodeLike>(count);
  for (let i = 0; i < count; i++) {
    const s = String(i);
    nodes[i] = {
      type: 'section',
      props: {
        key: s,
        id: `sec-${s}`,
        className: 'a b c',
        'data-i': s,
        title: `Hello ${s}`,
        style: {
          width: `${(i % 97) + 1}px`,
          height: `${(i % 53) + 1}px`,
          backgroundColor: 'transparent',
          borderTopWidth: `${i % 3}px`,
        },
      },
      children: [
        { type: 'h2', children: [s] },
        { type: 'p', children: ['Lorem ipsum dolor sit amet.'] },
      ],
    };
  }

  return { type: 'div', children: nodes as unknown[] };
}

function buildEscapeHeavyTree(count: number): VNodeLike {
  const nodes = new Array<VNodeLike>(count);
  for (let i = 0; i < count; i++) {
    const s = String(i);
    nodes[i] = {
      type: 'section',
      props: {
        key: s,
        // Force escaping in attrs
        title: `x"y'&<${s}>`,
        'data-x': `&<>'"${s}`,
      },
      children: [
        // Force escaping in text
        { type: 'h2', children: [`&<${s}>`] },
        { type: 'p', children: ['Tom & Jerry <3 > 2'] },
      ],
    };
  }
  return { type: 'div', children: nodes as unknown[] };
}

const PREBUILT_ATTRS = buildAttrsHeavyTree(COUNT);
const PREBUILT_ESCAPE = buildEscapeHeavyTree(COUNT);

describe('ssr render (isolated, attrs+escape)', () => {
  bench(`baseline: ${ITERS} tiny SSRs`, () => {
    const tiny: VNodeLike = {
      type: 'div',
      children: [{ type: 'p', children: ['x'] }],
    };

    for (let i = 0; i < ITERS; i++) {
      const html = renderTreeToString(tiny);
      if (html.length === 0) throw new Error('unexpected empty SSR output');
    }
  });

  bench(
    `render-only: ${ITERS} attrs-heavy SSRs (${COUNT} sections, prebuilt)`,
    () => {
      for (let i = 0; i < ITERS; i++) {
        const html = renderTreeToString(PREBUILT_ATTRS);
        if (html.length === 0) throw new Error('unexpected empty SSR output');
      }
    }
  );

  bench(
    `render-only: ${ITERS} escape-heavy SSRs (${COUNT} sections, prebuilt)`,
    () => {
      for (let i = 0; i < ITERS; i++) {
        const html = renderTreeToString(PREBUILT_ESCAPE);
        if (html.length === 0) throw new Error('unexpected empty SSR output');
      }
    }
  );
});
