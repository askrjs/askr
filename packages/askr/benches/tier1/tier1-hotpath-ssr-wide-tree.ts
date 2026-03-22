import { bench, describe, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import {
  buildWideSsrTree,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

const wideTree = buildWideSsrTree(1500);
verifyTier1Invariant('tier1 hotpath ssr wide tree', () => {
  const wideTreeHtml = renderToStringSync(() => wideTree);
  expect(wideTreeHtml).toContain('Wide card 0');
  expect(wideTreeHtml).toContain('Wide card 1499');
});

describe('tier1 ssr wide tree', () => {
  bench(
    'render a 1,500-sibling sync tree',
    () => {
      renderToStringSync(() => wideTree);
    },
    tier1BenchOptions
  );
});
