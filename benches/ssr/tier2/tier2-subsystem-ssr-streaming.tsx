import { bench, describe, expect } from 'vite-plus/test';
import { renderToStream, renderToString } from '../../../src/ssr';
import { tier2BenchOptions } from '../../shared/_shared';

const routes = [
  {
    path: '/',
    handler: () => (
      <article id={'main'}>
        <header>
          <h1>{'Hello'}</h1>
        </header>
        <p>{'World'}</p>
        <ul>
          {Array.from({ length: 250 }, (_, index) => (
            <li>{`Chunk ${index}`}</li>
          ))}
        </ul>
      </article>
    ),
  },
];

{
  const chunks: string[] = [];
  renderToStream({
    url: '/',
    routes,
    onChunk: (chunk) => chunks.push(chunk),
    onComplete: () => undefined,
  });
  expect(chunks.join('')).toBe(renderToString({ url: '/', routes }));
}

describe('tier2 ssr streaming', () => {
  bench(
    'stream a 250-item article route',
    () => {
      const chunks: string[] = [];
      renderToStream({
        url: '/',
        routes,
        onChunk: (chunk) => chunks.push(chunk),
        onComplete: () => undefined,
      });
    },
    tier2BenchOptions
  );
});
