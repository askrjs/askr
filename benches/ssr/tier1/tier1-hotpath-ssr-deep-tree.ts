import { bench, describe, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import {
  buildDeepSsrTree,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../../shared/_shared';

const deepTree = buildDeepSsrTree(300);
verifyTier1Invariant('tier1 hotpath ssr deep tree', () => {
  const deepTreeHtml = renderToStringSync(() => deepTree);
  expect(deepTreeHtml).toContain('Deep leaf marker');
  expect(deepTreeHtml).toContain('id="deep-level-299"');
});

describe('tier1 ssr deep tree', () => {
  bench(
    'render a 300-level nested sync tree',
    () => {
      renderToStringSync(() => deepTree);
    },
    tier1BenchOptions
  );
});
