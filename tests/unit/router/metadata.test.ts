import { describe, expect, it } from 'vite-plus/test';
import type { RouteContext } from '../../../src/common/router';
import {
  createRouteRegistry,
  group,
  page,
  resolveRouteMeta,
  route,
  serializeRouteMeta,
} from '../../../src/router';

const context: RouteContext = {
  mode: 'ssr',
  params: { id: '42' },
  pathname: '/users/42',
  search: '',
  hash: '',
  href: '/users/42',
  auth: {
    authenticated: false,
    principal: null,
    session: null,
    tenant: null,
  },
  signal: new AbortController().signal,
};

describe('route metadata', () => {
  it('should emit deterministic route metadata given nested layouts when SSG generates the same route repeatedly', async () => {
    const registry = createRouteRegistry(() => {
      group({ meta: { title: 'Docs', html: { lang: 'en' } } }, () => {
        page(
          '/guides/{id}',
          () => null,
          { meta: { description: 'Guides' } },
          () => {
            route('', () => null, {
              meta: ({ params }) => ({
                title: `Guide ${params.id}`,
                canonical: `/guides/${params.id}`,
              }),
            });
          }
        );
      });
    });
    const record = registry.manifest.records[0];
    const ssgContext = { ...context, mode: 'ssr' as const };

    const first = serializeRouteMeta(
      await resolveRouteMeta(record, ssgContext)
    );
    const second = serializeRouteMeta(
      await resolveRouteMeta(record, ssgContext)
    );

    expect(second).toBe(first);
    expect(first).toContain('<title data-askr-head="">Guide 42</title>');
    expect(first).toContain('href="/guides/42"');
  });

  it('should compose group page and route metadata from outermost to leaf', async () => {
    const registry = createRouteRegistry(() => {
      group(
        {
          meta: {
            title: 'Platform',
            openGraph: { site_name: 'Askr', title: 'Platform' },
            html: { lang: 'en' },
          },
        },
        () => {
          page(
            '/users/{id}',
            () => null,
            { meta: { title: 'Users', html: { dir: 'ltr' } } },
            () => {
              route('', () => null, {
                meta: ({ params }) => ({
                  title: `User ${params.id}`,
                  openGraph: { title: `User ${params.id}` },
                }),
              });
            }
          );
        }
      );
    });
    const record = registry.manifest.records[0];

    await expect(resolveRouteMeta(record, context)).resolves.toEqual({
      title: 'User 42',
      openGraph: { site_name: 'Askr', title: 'User 42' },
      html: { lang: 'en', dir: 'ltr' },
    });
  });

  it('should escape owned metadata nodes and JSON-LD', () => {
    expect(
      serializeRouteMeta({
        title: '<Unsafe & title>',
        description: '"quoted"',
        canonical: '/users?x="y"',
        jsonLd: { name: '</script><script>alert(1)</script>' },
      })
    ).toBe(
      '<title data-askr-head="">&lt;Unsafe &amp; title&gt;</title>' +
        '<meta data-askr-head="" name="description" content="&quot;quoted&quot;">' +
        '<link data-askr-head="" rel="canonical" href="/users?x=&quot;y&quot;">' +
        '<script data-askr-head="" type="application/ld+json">{"name":"\\u003c/script\\u003e\\u003cscript\\u003ealert(1)\\u003c/script\\u003e"}</script>'
    );
  });
});
