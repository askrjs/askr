import { describe, it, expect } from 'vitest';
import { renderToString, renderToStream } from '../../src/ssr';

describe('SSR streaming: parity and chunk boundaries', () => {
  it('should stream output equal renderToString (byte-for-byte)', () => {
    const routes = [
      {
        path: '/',
        handler: () => (
          <div class={'root'}>
            <h1>{'Title'}</h1>
            <p>
              {'This is '}
              <em>{'important'}</em>
              {'.'}
            </p>
            <ul>
              <li>{'One'}</li>
              <li>{'Two'}</li>
              <li>{'Three'}</li>
            </ul>
          </div>
        ),
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
        handler: () => (
          <article id={'main'}>
            <header>
              <h1>{'Hello'}</h1>
            </header>
            <p>{'World'}</p>
          </article>
        ),
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
