import { describe, expect, it } from 'vite-plus/test';
import { schema } from '@askrjs/schema';
import {
  createRouteRegistry,
  resolveRouteRequest,
  route,
} from '../../../src/router';
import { parseRouteSearch } from '../../../src/router/route-search';

const Search = schema.object({
  page: schema.integer({ minimum: 1, default: 1 }),
  sort: schema.enum(['asc', 'desc'], { default: 'asc' }),
  q: schema.optional(schema.string()),
  open: schema.optional(schema.boolean()),
  tag: schema.optional(schema.array(schema.string())),
});

describe('parseRouteSearch', () => {
  it('should convert query strings to the declared types', () => {
    expect(
      parseRouteSearch(Search, '?page=3&sort=desc&q=hi&open=true&tag=a&tag=b')
    ).toEqual({
      page: 3,
      sort: 'desc',
      q: 'hi',
      open: true,
      tag: ['a', 'b'],
    });
  });

  it('should take the default for a missing value', () => {
    expect(parseRouteSearch(Search, '')).toEqual({ page: 1, sort: 'asc' });
  });

  it('should take the default for an invalid value and drop an invalid key without one', () => {
    expect(
      parseRouteSearch(Search, '?page=zero&sort=sideways&open=maybe&q=ok')
    ).toEqual({ page: 1, sort: 'asc', q: 'ok' });
    expect(parseRouteSearch(Search, '?page=0')).toEqual({
      page: 1,
      sort: 'asc',
    });
  });

  it('should ignore keys the schema does not declare', () => {
    expect(parseRouteSearch(Search, '?utm_source=x&page=2')).toEqual({
      page: 2,
      sort: 'asc',
    });
  });

  it('should keep going when a required property has no value and no default', () => {
    const Required = schema.object({
      id: schema.integer(),
      q: schema.string(),
    });
    expect(parseRouteSearch(Required, '?id=nope&q=x')).toEqual({ q: 'x' });
  });
});

describe('route search in resolution', () => {
  it('should expose the parsed search to loaders, metadata and policies', async () => {
    const seen: Record<string, unknown> = {};
    const registry = createRouteRegistry(() => {
      route('/list', () => null, {
        search: Search,
        policies: [
          (context) => {
            seen.policy = context.searchParams;
            return { kind: 'allow' };
          },
        ],
        loader: ({ searchParams }) => {
          seen.loader = searchParams;
          return searchParams.page;
        },
        meta: ({ searchParams }) => {
          seen.meta = searchParams;
          return { title: `Page ${searchParams.page}` };
        },
      });
    });
    const result = await resolveRouteRequest('/list?page=4&sort=bad', {
      registry,
      mode: 'spa',
    });
    expect(result?.kind).toBe('render');
    expect(seen.policy).toEqual({ page: 4, sort: 'asc' });
    expect(seen.loader).toEqual({ page: 4, sort: 'asc' });
  });

  it('should expose an empty object when the route declares no search schema', async () => {
    let seen: unknown;
    const registry = createRouteRegistry(() => {
      route('/plain', () => null, {
        loader: ({ searchParams }) => {
          seen = searchParams;
          return null;
        },
      });
    });
    await resolveRouteRequest('/plain?x=1', { registry, mode: 'spa' });
    expect(seen).toEqual({});
  });
});
