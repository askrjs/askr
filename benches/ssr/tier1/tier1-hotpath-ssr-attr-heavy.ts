import { bench, describe, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import {
  buildAttrHeavySsrTree,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../../shared/_shared';

const attrHeavyTree = buildAttrHeavySsrTree(400);
verifyTier1Invariant('tier1 hotpath ssr attr heavy', () => {
  const attrHeavyHtml = renderToStringSync(() => attrHeavyTree);
  expect(attrHeavyHtml).toContain('id="attr-node-0"');
  expect(attrHeavyHtml).toContain('id="attr-node-399"');
  expect(attrHeavyHtml).toContain('&amp;');
  expect(attrHeavyHtml).toContain('&quot;');
  expect(attrHeavyHtml).toContain('&#x27;');
});

describe('tier1 ssr attr heavy', () => {
  bench(
    'render 400 attr-heavy nodes with escaped attributes',
    () => {
      renderToStringSync(() => attrHeavyTree);
    },
    tier1BenchOptions
  );
});
