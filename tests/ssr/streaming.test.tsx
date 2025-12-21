import { describe, it, expect } from 'vitest';
import { renderToString, renderToStream } from '../../src/ssr';

describe('SSR streaming: parity and chunk boundaries', () => {
  it('should stream output equal renderToString (byte-for-byte) and chunks align to structural writes', () => {
    const routes = [
      {
        path: '/',
        handler: () => ({
          type: 'div',
          props: { class: 'root' },
          children: [
            { type: 'h1', children: ['Title'] },
            { type: 'p', children: ['This is ', { type: 'em', children: ['important'] }, '.'] },
            { type: 'ul', children: [
              { type: 'li', children: ['One'] },
              { type: 'li', children: ['Two'] },
              { type: 'li', children: ['Three'] },
            ] }
          ]
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

    // Parity check
    const expected = renderToString({ url: '/', routes });
    expect(chunks.join('')).toBe(expected);

    // Chunk boundary structural check: each chunk should be either a start tag, end tag, or plain text
    const startTag = /^<\w+(\s[^>]*)?>$/; // <tag ...>
    const endTag = /^<\/\w+>$/; // </tag>
    const voidOrSelfClosing = /^<\w+(\s[^>]*)?\s*\/?>$/; // <img /> or <br /> or <tag />
    const textOnly = /^[^<>]+$/; // text without angle brackets

    for (const chunk of chunks) {
      // allow whitespace-only chunks
      if (!chunk) continue;
      const ok = startTag.test(chunk) || endTag.test(chunk) || voidOrSelfClosing.test(chunk) || textOnly.test(chunk);
      expect(ok).toBe(true);
    }
  });
});
