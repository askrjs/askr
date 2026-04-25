import { bench, describe, expect } from 'vite-plus/test';
import { renderToStringSync } from '../../../src/ssr';
import { tier1BenchOptions, verifyTier1Invariant } from '../../shared/_shared';

function renderHotTree() {
  return renderToStringSync(() => (
    <section id={'root'}>
      <h1>{'SSR hot path'}</h1>
      <ul>
        {Array.from({ length: 250 }, (_, index) => (
          <li data-row={index}>{`Item ${index}`}</li>
        ))}
      </ul>
    </section>
  ));
}

verifyTier1Invariant('tier1 hotpath ssr render', () => {
  expect(renderHotTree()).toContain('SSR hot path');
});

describe('tier1 ssr render', () => {
  bench(
    'render a 250-row sync SSR tree to string',
    () => {
      renderHotTree();
    },
    tier1BenchOptions
  );
});
