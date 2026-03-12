import { bench, describe, expect } from 'vitest';
import { renderToStringSync } from '../../src/ssr';
import { tier1BenchOptions } from '../shared/_shared';

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
