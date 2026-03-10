import { bench, describe, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import { tier1BenchOptions } from '../shared/_shared';

function renderHotTree() {
  return renderToStringSync(() => ({
    type: 'section',
    props: { id: 'root' },
    children: [
      { type: 'h1', children: ['SSR hot path'] },
      {
        type: 'ul',
        children: Array.from({ length: 250 }, (_, index) => ({
          type: 'li',
          props: { 'data-row': index },
          children: [`Item ${index}`],
        })),
      },
    ],
  }));
}

expect(renderHotTree()).toContain('SSR hot path');

describe('tier1 ssr render', () => {
  bench(
    'render a 250-row sync SSR tree to string',
    () => {
      renderHotTree();
    },
    tier1BenchOptions
  );
});
