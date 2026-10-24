import { resetRouteState } from '../../router-test-utils';
import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import { schema, type InferSchema } from '@askrjs/schema';
import { createSPA } from '@askrjs/askr/boot';
import { navigate } from '../../../src/router/navigate';
import {
  createRouteRegistry,
  currentRoute,
  route,
} from '../../../src/router/route';
import { createTestContainer } from '../../../test-utils/render/test-renderer';

vi.mock('../../../src/router/document-navigation', () => ({
  loadDocument: vi.fn(),
  reloadDocument: vi.fn(),
}));

const Search = schema.object({
  page: schema.integer({ minimum: 1, default: 1 }),
  sort: schema.enum(['asc', 'desc'], { default: 'asc' }),
});

describe('typed inbound search params', () => {
  let { container, cleanup } = createTestContainer();

  beforeEach(() => {
    ({ container, cleanup } = createTestContainer());
    resetRouteState();
    window.history.replaceState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
  });

  it('should render the route with defaults for invalid query values instead of failing', async () => {
    window.history.replaceState({}, '', '/list?page=abc&sort=sideways&x=1');
    const seen: unknown[] = [];
    const registry = createRouteRegistry(() => {
      route(
        '/list',
        () => {
          const current = currentRoute<
            Record<string, string>,
            unknown,
            unknown,
            InferSchema<typeof Search>
          >();
          seen.push(current.search);
          return (
            <p>
              {current.search.page}:{current.search.sort}
            </p>
          );
        },
        {
          search: Search,
          loader: ({ searchParams }) => searchParams.page,
        }
      );
    });
    await createSPA({ root: container, registry });
    expect(container.textContent).toBe('1:asc');
    expect(seen[0]).toEqual({ page: 1, sort: 'asc' });
  });

  it('should parse the query of a client navigation for the loader and currentRoute', async () => {
    const loaded: unknown[] = [];
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route(
        '/list',
        () => {
          const current = currentRoute<
            Record<string, string>,
            unknown,
            unknown,
            InferSchema<typeof Search>
          >();
          return (
            <p>
              {typeof current.search.page}:{current.search.page}:
              {current.search.sort}
            </p>
          );
        },
        {
          search: Search,
          loader: ({ searchParams }) => {
            loaded.push(searchParams);
            return null;
          },
        }
      );
    });
    await createSPA({ root: container, registry });

    navigate('/list?page=3&sort=desc');
    await vi.waitFor(() => expect(container.textContent).toBe('number:3:desc'));
    expect(loaded.at(-1)).toEqual({ page: 3, sort: 'desc' });
  });
});
