import { bench, describe, expect } from 'vitest';
import { renderToStringSync } from '../src/ssr';
import { buildAttrHeavySsrTree, tier1BenchOptions } from './_shared';

const attrHeavyTree = buildAttrHeavySsrTree(400);
const attrHeavyHtml = renderToStringSync(() => attrHeavyTree);

expect(attrHeavyHtml).toContain('id="attr-node-0"');
expect(attrHeavyHtml).toContain('id="attr-node-399"');
expect(attrHeavyHtml).toContain('&amp;');
expect(attrHeavyHtml).toContain('&quot;');
expect(attrHeavyHtml).toContain('&#x27;');

describe('tier1 ssr attr heavy', () => {
  bench(
    'render 400 attr-heavy nodes with escaped attributes',
    () => {
      renderToStringSync(() => attrHeavyTree);
    },
    tier1BenchOptions
  );
});
