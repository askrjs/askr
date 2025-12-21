import { describe, it, expect } from 'vitest';
import { renderToString, renderToStream } from '../../src/ssr';

describe('SSR streaming parity', () => {
  it('should stream SSR matches string SSR', () => {
    const routes = [
      { path: '/', handler: () => ({ type: 'div', children: ['x'] }) },
    ];

    let out = '';
    renderToStream({
      url: '/',
      routes,
      onChunk: (c) => (out += c),
      onComplete: () => {},
    });

    expect(out).toBe(renderToString({ url: '/', routes }));
  });
});
