import { describe, it, expect } from 'vite-plus/test';
import { routeRegistryFromTable } from '../../router-test-utils';
import { renderToString, renderToStream } from '../../../src/ssr';
import {
  DefaultPortal,
  Portal,
} from '../../../src/foundations/structures/portal';

describe('SSR streaming: parity and chunk boundaries', () => {
  it('should preserve escaped attributes and text given adversarial SSR values when rendering HTML and streaming output', () => {
    const adversarial = `"><script>alert('xss')</script>&`;
    const registry = routeRegistryFromTable([
      {
        path: '/',
        handler: () => <div title={adversarial}>{adversarial}</div>,
      },
    ]);
    const chunks: string[] = [];

    renderToStream({
      url: '/',
      registry,
      onChunk: (chunk) => chunks.push(chunk),
      onComplete: () => {},
    });
    const html = renderToString({ url: '/', registry });
    const streamed = chunks.join('');

    expect(streamed).toBe(html);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&quot;&gt;');
    expect(html).toContain('&amp;');
  });

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
      registry: routeRegistryFromTable(routes),
      onChunk: (c) => chunks.push(c),
      onComplete: () => {},
    });

    // Parity check: concatenated chunks must match renderToString exactly
    const expected = renderToString({
      url: '/',
      registry: routeRegistryFromTable(routes),
    });
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
      registry: routeRegistryFromTable(routes),
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

  it('should stream content before an explicit portal host and backfill the host', () => {
    const routes = [
      {
        path: '/',
        handler: () => (
          <main>
            <header>{'before portal'}</header>
            <DefaultPortal />
            <footer>{'after portal'}</footer>
            <Portal>
              <aside>{'overlay'}</aside>
            </Portal>
          </main>
        ),
      },
    ];
    const registry = routeRegistryFromTable(routes);
    const chunks: string[] = [];

    renderToStream({
      url: '/',
      registry,
      onChunk: (chunk) => chunks.push(chunk),
      onComplete: () => {},
    });

    expect(chunks.slice(0, -1).join('')).toContain(
      '<header>before portal</header>'
    );
    expect(chunks.at(-1)).toContain('<aside>overlay</aside>');
    expect(chunks.join('')).toBe(renderToString({ url: '/', registry }));
  });

  it('should buffer app HTML before applying a document renderer', () => {
    const routes = [
      {
        path: '/users/{id}',
        namespace: 'users',
        handler: ({ id }: { id: string }) => <main>User {id}</main>,
      },
    ];
    let seenContext: Record<string, unknown> | null = null;
    const expectedAppHtml = renderToString({
      url: '/users/42?view=full#summary',
      registry: routeRegistryFromTable(routes),
    });
    const chunks: string[] = [];

    renderToStream({
      url: '/users/42?view=full#summary',
      registry: routeRegistryFromTable(routes),
      document: ({
        appHtml,
        context,
      }: {
        appHtml: string;
        context: Record<string, unknown>;
      }) => {
        seenContext = context;
        return `<!doctype html><html><body>${appHtml}</body></html>`;
      },
      onChunk: (c) => chunks.push(c),
      onComplete: () => {},
    });

    expect(chunks).toEqual([
      `<!doctype html><html><body>${expectedAppHtml}</body></html>`,
    ]);
    expect(seenContext).toMatchObject({
      mode: 'ssr',
      url: '/users/42?view=full#summary',
      pathname: '/users/42',
      search: '?view=full',
      hash: '#summary',
      params: { id: '42' },
      seed: 12345,
      route: {
        path: '/users/{id}',
        namespace: 'users',
      },
    });
  });
});
