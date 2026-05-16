import { bench, describe, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../src/ssr';
import { buildAttrHeavySsrTree, tier4BenchOptions } from '../shared/_shared';

const attrHeavyTree = buildAttrHeavySsrTree(400);

await (async () => {
  const html = renderToStringSync(() => attrHeavyTree);

  expect(html).toContain('id="attr-node-0"');
  expect(html).toContain('id="attr-node-399"');
  expect(html).toContain('&amp;');
  expect(html).toContain('&quot;');
  expect(html).toContain('&#x27;');
})();

describe('tier4 integration ssr attr heavy', () => {
  bench(
    'render 400 attr-heavy nodes with escaped attributes',
    () => {
      renderToStringSync(() => attrHeavyTree);
    },
    tier4BenchOptions
  );
});
