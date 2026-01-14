import { describe, it, expect } from 'vitest';
import { renderToString, renderToStream } from '../../src/ssr';

describe('SSR streaming: parity and chunk boundaries', () => {
  it('should stream output equal renderToString (byte-for-byte)', () => {
    const routes = [
      {
        path: '/',
        handler: () => ({
          type: 'div',
          props: { class: 'root' },
          children: [
            { type: 'h1', children: ['Title'] },
            {
              type: 'p',
              children: [
                'This is ',
                { type: 'em', children: ['important'] },
                '.',
              ],
            },
            {
              type: 'ul',
              children: [
                { type: 'li', children: ['One'] },
                { type: 'li', children: ['Two'] },
                { type: 'li', children: ['Three'] },
              ],
            },
          ],
        }),
      },
    ];

    const chunks: string[] = [];
    renderToStream({
      url: '/',
      routes,
      onChunk: (c) => chunks.push(c),
      onComplete: () => {},
    });

    // Parity check: concatenated chunks must match renderToString exactly
    const expected = renderToString({ url: '/', routes });
    expect(chunks.join('')).toBe(expected);

    // Verify we got multiple chunks (streaming is working)
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('should produce valid HTML when joined', () => {
    const routes = [
      {
        path: '/',
        handler: () => ({
          type: 'article',
          props: { id: 'main' },
          children: [
            { type: 'header', children: [{ type: 'h1', children: ['Hello'] }] },
            { type: 'p', children: ['World'] },
          ],
        }),
      },
    ];

    const chunks: string[] = [];
    renderToStream({
      url: '/',
      routes,
      onChunk: (c) => chunks.push(c),
      onComplete: () => {},
    });

    const html = chunks.join('');
    expect(html).toContain('<article');
    expect(html).toContain('id="main"');
    expect(html).toContain('<h1>Hello</h1>');
    expect(html).toContain('<p>World</p>');
    expect(html).toContain('</article>');
  });
});
