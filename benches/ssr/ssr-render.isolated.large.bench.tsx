/**
 * SSR render isolated benchmarks
 *
 * Goal: separate renderer/sink cost from VNode construction cost.
 *
 * Notes:
 * - `build-only` measures just VNode tree construction.
 * - `render-only (prebuilt)` reuses the same prebuilt VNode tree per iteration to
 *   reduce allocation pressure and GC variance.
 * - `baseline` shows renderToStringSync overhead on a tiny tree.
 */

import { bench, describe } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import type { VNode } from '../../src/ssr';
import type { JSXElement } from '../../src/common/jsx';

const HUGE_10K = 10000;
const ITERS = 20;
const LOREM = 'Lorem ipsum dolor sit amet.';

type VNodeLike = {
  type: string;
  props?: Record<string, unknown>;
  children?: unknown[];
};

type SSRNode = VNode | JSXElement | string | number | null;

function buildHugeTree(sectionCount: number): VNodeLike {
  const sections = new Array<VNodeLike>(sectionCount);
  for (let i = 0; i < sectionCount; i++) {
    const s = String(i);
    sections[i] = {
      type: 'section',
      props: { key: s },
      children: [
        { type: 'h2', children: [s] },
        { type: 'p', children: [LOREM] },
      ],
    };
  }

  return {
    type: 'div',
    children: sections as unknown[],
  };
}

// Prebuilt tree for render-only runs.
const PREBUILT_HUGE = buildHugeTree(HUGE_10K);

function renderTreeToString(tree: VNodeLike): string {
  return renderToStringSync(() => tree as unknown as SSRNode);
}

describe('ssr render (isolated, large)', () => {
  bench('build-only: 20 huge trees (10000 sections)', () => {
    for (let i = 0; i < ITERS; i++) {
      const tree = buildHugeTree(HUGE_10K);
      // Prevent dead-code elimination and assert shape.
      if (!tree.children || tree.children.length !== HUGE_10K) {
        throw new Error('buildHugeTree produced unexpected shape');
      }
    }
  });

  bench('baseline: 20 tiny SSRs', () => {
    const tiny: VNodeLike = {
      type: 'div',
      children: [{ type: 'p', children: ['x'] }],
    };

    for (let i = 0; i < ITERS; i++) {
      const html = renderTreeToString(tiny);
      if (html.length === 0) throw new Error('unexpected empty SSR output');
    }
  });

  bench('render-only: 20 huge tree SSRs (prebuilt, 10000 sections)', () => {
    for (let i = 0; i < ITERS; i++) {
      const html = renderTreeToString(PREBUILT_HUGE);
      if (html.length === 0) throw new Error('unexpected empty SSR output');
    }
  });
});
