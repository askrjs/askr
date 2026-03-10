import { bench, describe, expect } from 'vitest';
import { renderToStream, renderToString } from '../../src/ssr';
import { tier2BenchOptions } from '../shared/_shared';

const routes = [
  {
    path: '/',
    handler: () => ({
      type: 'article',
      props: { id: 'main' },
      children: [
        { type: 'header', children: [{ type: 'h1', children: ['Hello'] }] },
        { type: 'p', children: ['World'] },
        {
          type: 'ul',
          children: Array.from({ length: 250 }, (_, index) => ({
            type: 'li',
            children: [`Chunk ${index}`],
          })),
        },
      ],
    }),
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
