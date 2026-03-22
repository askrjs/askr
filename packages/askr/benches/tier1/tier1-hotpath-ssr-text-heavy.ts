import { bench, describe, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import {
  buildTextHeavySsrTree,
  tier1BenchOptions,
  verifyTier1Invariant,
} from '../shared/_shared';

const textHeavyTree = buildTextHeavySsrTree(400);
verifyTier1Invariant('tier1 hotpath ssr text heavy', () => {
  const textHeavyHtml = renderToStringSync(() => textHeavyTree);
  const textStartIndex = textHeavyHtml.indexOf('Text block 0 start');
  const emIndex = textHeavyHtml.indexOf('em-0');
  const strongIndex = textHeavyHtml.indexOf('strong-0');
  const segmentIndex = textHeavyHtml.indexOf('segment-0');

  expect(textHeavyHtml).toContain('tail-399 &amp; finish');
  expect(textHeavyHtml).toContain('&amp;');
  expect(textHeavyHtml).toContain('&lt;');
  expect(textStartIndex).toBeGreaterThanOrEqual(0);
  expect(textStartIndex).toBeLessThan(emIndex);
  expect(emIndex).toBeLessThan(strongIndex);
  expect(strongIndex).toBeLessThan(segmentIndex);
});

describe('tier1 ssr text heavy', () => {
  bench(
    'render 400 mixed text-boundary nodes',
    () => {
      renderToStringSync(() => textHeavyTree);
    },
    tier1BenchOptions
  );
});
