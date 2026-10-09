import { afterEach, describe, expect, it } from 'vite-plus/test';
import type { AuthContext, AuthRequirement } from '@askrjs/auth';
import type { RouteContext } from '../../../src/common/router';
import {
  createRouteRegistry,
  group,
  page,
  route,
} from '../../../src/router/route';
import { resolveRouteMeta } from '../../../src/router/metadata';
import { resolveRouteRequest } from '../../../src/router/resolution';
import { clearRouteState } from '../../../src/router/store';

const auth: AuthContext = {
  authenticated: true,
  principal: { id: 'reader', roles: ['member'] },
  session: null,
  tenant: null,
};
const context: RouteContext = {
  mode: 'ssr',
  params: { id: '42' },
  pathname: '/docs/42/details',
  search: '',
  hash: '',
  href: '/docs/42/details',
  auth,
  signal: new AbortController().signal,
};

afterEach(() => clearRouteState());

describe('route authoring scope ownership', () => {
  it('should capture nested group and page inheritance in declaration order', async () => {
    const calls: string[] = [];
    const allow =
      (name: string): AuthRequirement =>
      () => {
        calls.push(name);
        return { allowed: true };
      };
    const Layout = () => null;
    const Page = () => null;
    const InnerLayout = () => null;
    const registry = createRouteRegistry(() => {
      group(
        {
          layout: Layout,
          auth: allow('outer'),
          meta: { title: 'Outer', html: { lang: 'en' } },
        },
        () => {
          page(
            '/docs/{id}',
            Page,
            {
              auth: allow('page'),
              meta: { description: 'Page', html: { dir: 'ltr' } },
            },
            () => {
              group(
                {
                  layout: InnerLayout,
                  auth: allow('inner'),
                  meta: { title: 'Inner' },
                },
                () => {
                  route('details', () => null, {
                    auth: allow('leaf'),
                    meta: { title: 'Leaf' },
                  });
                }
              );
            }
          );
        }
      );
    });
    const record = registry.manifest.records[0];
    expect(record.path).toBe('/docs/{id}/details');
    expect(record.layoutChain).toEqual([
      { component: Layout },
      { component: InnerLayout },
    ]);
    expect(record.pageChain).toEqual([{ component: Page }]);
    expect(
      (
        await resolveRouteRequest(context.pathname, {
          registry,
          authContext: auth,
        })
      )?.kind
    ).toBe('render');
    expect(calls).toEqual(['outer', 'page', 'inner', 'leaf']);
    await expect(resolveRouteMeta(record, context)).resolves.toEqual({
      title: 'Leaf',
      description: 'Page',
      html: { lang: 'en', dir: 'ltr' },
    });
  });

  it('should stop inherited auth at a page denial before inner auth and loaders', async () => {
    const calls: string[] = [];
    const registry = createRouteRegistry(() => {
      group(
        {
          auth: () => {
            calls.push('outer');
            return { allowed: true };
          },
        },
        () => {
          page(
            '/docs',
            () => null,
            {
              auth: () => {
                calls.push('page');
                return { allowed: false, reason: 'forbidden' };
              },
            },
            () => {
              group(
                {
                  auth: () => {
                    calls.push('inner');
                    return { allowed: true };
                  },
                },
                () => {
                  route('details', () => null, {
                    auth: () => {
                      calls.push('leaf');
                      return { allowed: true };
                    },
                    loader: () => {
                      calls.push('loader');
                      return null;
                    },
                  });
                }
              );
            }
          );
        }
      );
    });
    await expect(
      Promise.resolve(
        resolveRouteRequest('/docs/details', { registry, authContext: auth })
      )
    ).resolves.toEqual({ kind: 'deny', status: 403 });
    expect(calls).toEqual(['outer', 'page']);
  });

  it('should unwind thrown definition scopes without changing already registered records', () => {
    const Layout = () => null;
    const Page = () => null;
    const registry = createRouteRegistry(() => {
      expect(() =>
        group(
          {
            layout: Layout,
            auth: () => ({ allowed: true }),
            meta: { title: 'Scoped' },
          },
          () => {
            page('/docs', Page, () => {
              group({}, () => {
                route('kept', () => null);
                throw new Error('definition failed');
              });
            });
          }
        )
      ).toThrow('definition failed');
      route('/after', () => null);
    });
    const scoped = registry.manifest.records.find(
      (record) => record.path === '/docs/kept'
    )!;
    const after = registry.manifest.records.find(
      (record) => record.path === '/after'
    )!;
    expect(scoped.layoutChain).toEqual([{ component: Layout }]);
    expect(scoped.pageChain).toEqual([{ component: Page }]);
    expect(scoped.metaChain).toHaveLength(1);
    expect(after.layoutChain).toEqual([]);
    expect(after.pageChain).toEqual([]);
    expect(after.metaChain).toBeUndefined();
    expect(after.options?.auth).toBeUndefined();
  });
});
