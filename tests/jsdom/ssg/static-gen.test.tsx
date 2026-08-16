import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
} from 'vite-plus/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  createStaticGen as createRegistryStaticGen,
  replaceOutputDirectory,
} from '../../../src/ssg/create-static-gen';
import { writeStaticFiles } from '../../../src/ssg/write-static-files';
import { SSG_MANIFEST_SCHEMA_VERSION } from '../../../src/ssg/incremental-manifest';
import type { RouteConfig } from '../../../src/ssg/types';
import type { JSXElement } from '../../../src/jsx/types';
import type { DocumentRenderContext } from '../../../src/common/ssr';
import { resource } from '../../../src/resources';
import { defineScope } from '../../../src/runtime/context';
import { state } from '../../../src/runtime/state';
import {
  DefaultPortal,
  Portal,
} from '../../../src/foundations/structures/portal';
import {
  createRouteRegistry,
  fallback,
  group,
  lazy,
  route,
} from '../../../src/router/route';
import { requireAnonymous, requireUser } from '@askrjs/auth';
import { Link } from '../../../src/components/link';

/** Convert the historical fixture shorthand into the explicit registry API. */
function createStaticGen(
  options: unknown
): ReturnType<typeof createRegistryStaticGen> {
  const legacyOptions = options as {
    routes?: readonly Record<string, unknown>[];
    [key: string]: unknown;
  };
  if (!legacyOptions || !Array.isArray(legacyOptions.routes)) {
    return createRegistryStaticGen(options as never);
  }

  const registry = createRouteRegistry(() => {
    for (const config of legacyOptions.routes ?? []) {
      const component = config.component as
        | ((props: Record<string, unknown>, context: unknown) => unknown)
        | undefined;
      const handler =
        (config.handler as
          | ((params: Record<string, string>, context: unknown) => unknown)
          | undefined) ??
        ((params: Record<string, string>, context: unknown) =>
          component?.(
            {
              ...(config.props as Record<string, unknown> | undefined),
              ...params,
            },
            context
          ));
      route(
        config.path as string,
        handler as never,
        {
          ...config,
          component: undefined,
          handler: undefined,
        } as never
      );
    }
  });

  const recordsByPath = new Map<string, typeof registry.manifest.records>();
  for (const record of registry.manifest.records) {
    const records = recordsByPath.get(record.path) ?? [];
    records.push(record);
    recordsByPath.set(record.path, records);
  }
  for (const config of legacyOptions.routes ?? []) {
    const records = recordsByPath.get(config.path as string) ?? [];
    const record = records.shift();
    if (!record) continue;
    Object.assign(record.options, {
      params: config.params,
      props: config.props,
      invalidationKeys: config.invalidationKeys,
    });
  }

  return createRegistryStaticGen({
    ...legacyOptions,
    registry,
    routes: undefined,
  } as never);
}

// Test utilities
function createTempDir(): string {
  const tempDir = path.join(
    process.cwd(),
    '.tmp-ssg-test-' + Date.now() + '-' + Math.random().toString(36).slice(2)
  );
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function cleanupTempDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function readManifest(tempDir: string) {
  return readJson<{
    schemaVersion: number;
    seed: number;
    mode: 'full' | 'incremental';
    routes: Array<{
      routeId: string;
      path: string;
      filePath: string;
      invalidationKeys: string[];
      htmlHash: string | null;
      lastStatus: 'success' | 'error';
    }>;
  }>(path.join(tempDir, '.askr', 'ssg-manifest.json'));
}

// Test components
const Home = (): JSXElement => <div>Home</div>;

const About = (): JSXElement => <div>About Page</div>;

const BlogPost = (props: { slug?: string }): JSXElement => (
  <div>
    <h1>Blog Post</h1>
    <p>Slug: {props.slug}</p>
  </div>
);

const SyncResourcePage = (): JSXElement => {
  const result = resource(() => 'loaded', []);
  return <main>{result.value ?? 'loading'}</main>;
};

describe('Static Site Generation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createStaticGen', () => {
    it('should throw if no routes or registry provided', () => {
      expect(() =>
        createStaticGen({
          routes: [],
          outputDir: tempDir,
        })
      ).toThrow('route registry is required');
    });

    it('should throw if no outputDir provided', () => {
      expect(() =>
        createStaticGen({
          routes: [{ path: '/', component: Home }],
          outputDir: '',
        })
      ).toThrow('outputDir is required');
    });

    it('should return a generator with expected methods', () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      expect(ssg.generate).toBeDefined();
      expect(typeof ssg.generate).toBe('function');
      expect(ssg.getConfig).toBeDefined();
      expect(ssg.getResult).toBeDefined();
    });

    it('should expose generator config', () => {
      const routes = [{ path: '/', component: Home }];
      const ssg = createStaticGen({
        routes,
        outputDir: tempDir,
        seed: 42,
      });

      const config = ssg.getConfig();
      expect(config.routeCount).toBe(1);
      expect(config.outputDir).toBe(tempDir);
      expect(config.seed).toBe(42);
    });

    it('should return null result before generate', () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      expect(ssg.getResult()).toBeNull();
    });
  });

  describe('generation', () => {
    it('should generate static HTML for a single route', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].status).toBe('success');
      expect(result.routes[0].html).toContain('<div');
      expect(result.routes[0].html).toContain('Home');
    });

    it('should generate static HTML from an explicit route registry', async () => {
      const registry = createRouteRegistry(() => {
        route('/', () => <main>{'Registry Home'}</main>);
      });
      const ssg = createStaticGen({
        registry,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(1);
      expect(result.successful).toBe(1);
      expect(result.routes[0].html).toBe('<main>Registry Home</main>');
    });

    it('should preload lazy registry pages and layouts before rendering', async () => {
      const LazyLayout = lazy(async () => ({
        default: ({ children }: { children?: unknown }) => (
          <section>{children}</section>
        ),
      }));
      const LazyPage = lazy(async () => ({
        default: () => <main>{'Lazy registry page'}</main>,
      }));
      const registry = createRouteRegistry(() => {
        group({ layout: LazyLayout }, () => {
          route('/lazy', LazyPage);
        });
      });
      const ssg = createStaticGen({ registry, outputDir: tempDir });

      const result = await ssg.generate();

      expect(result.failed).toBe(0);
      expect(result.routes[0].html).toBe(
        '<section><main>Lazy registry page</main></section>'
      );
    });

    it('should preserve lazy import failures in route diagnostics', async () => {
      const BrokenPage = lazy(async () => {
        throw new Error('lazy module unavailable');
      });
      const registry = createRouteRegistry(() => {
        route('/broken', BrokenPage);
      });
      const ssg = createStaticGen({ registry, outputDir: tempDir });

      const result = await ssg.generate();

      expect(result.failed).toBe(1);
      expect(result.routes[0]).toMatchObject({
        path: '/broken',
        status: 'error',
        error: 'lazy module unavailable',
      });
    });

    it('should render stateful registry routes inside their layout render scope', async () => {
      const StatefulChild = () => {
        const [count] = state(2);
        return <span>{count()}</span>;
      };
      const registry = createRouteRegistry(() => {
        group(
          { layout: ({ children }) => <section>{children}</section> },
          () => {
            route('/', () => {
              const [count] = state(1);
              return (
                <button>
                  {count()}
                  <StatefulChild />
                </button>
              );
            });
          }
        );
      });
      const ssg = createStaticGen({ registry, outputDir: tempDir });

      const result = await ssg.generate();

      expect(result.failed).toBe(0);
      expect(result.routes[0].html).toBe(
        '<section><button>1<span>2</span></button></section>'
      );
    });

    it('should not generate registry fallback records as concrete pages', async () => {
      const registry = createRouteRegistry(() => {
        route('/', () => <main>{'Registry Home'}</main>);
        fallback(() => <main>{'Missing'}</main>);
      });
      const ssg = createStaticGen({
        registry,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(1);
      expect(result.routes.map((route) => route.path)).toEqual(['/']);
      expect(fs.existsSync(path.join(tempDir, '*', 'index.html'))).toBe(false);
    });

    it('should preserve Context sibling children in generated HTML', async () => {
      const ThemeScope = defineScope('default');
      const ScopedSiblings = (): JSXElement => (
        <ThemeScope value={'scoped'}>
          {[<span>{'a'}</span>, <main>{'b'}</main>]}
        </ThemeScope>
      );

      const ssg = createStaticGen({
        routes: [{ path: '/', component: ScopedSiblings }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const indexFile = path.join(tempDir, 'index.html');
      const content = fs.readFileSync(indexFile, 'utf8');

      expect(result.routes[0].html).toBe('<span>a</span><main>b</main>');
      expect(content).toBe('<span>a</span><main>b</main>');
    });

    it('should preserve direct route handler sibling arrays in generated HTML', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            handler: () => [<span>{'a'}</span>, <main>{'b'}</main>],
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const indexFile = path.join(tempDir, 'index.html');
      const content = fs.readFileSync(indexFile, 'utf8');

      expect(result.routes[0].html).toBe('<span>a</span><main>b</main>');
      expect(content).toBe('<span>a</span><main>b</main>');
    });

    it('should generate portal content at explicit and automatic hosts', async () => {
      const registry = createRouteRegistry(() => {
        route('/explicit', () => (
          <main>
            <DefaultPortal />
            <Portal>
              <strong>{'explicit portal'}</strong>
            </Portal>
          </main>
        ));
        route('/automatic', () => (
          <main>
            <Portal>
              <strong>{'automatic portal'}</strong>
            </Portal>
          </main>
        ));
      });
      const ssg = createStaticGen({ registry, outputDir: tempDir });

      const result = await ssg.generate();

      expect(result.failed).toBe(0);
      expect(
        fs.readFileSync(path.join(tempDir, 'explicit', 'index.html'), 'utf8')
      ).toBe(
        '<main><strong>explicit portal</strong><!--askr-portal-anchor:1--></main>'
      );
      expect(
        fs.readFileSync(path.join(tempDir, 'automatic', 'index.html'), 'utf8')
      ).toBe(
        '<main><!--askr-portal-anchor:0--></main><strong>automatic portal</strong>'
      );
    });

    it('should generate HTML files in correct directory structure', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();

      const indexFile = path.join(tempDir, 'index.html');
      expect(fs.existsSync(indexFile)).toBe(true);
      const content = fs.readFileSync(indexFile, 'utf8');
      expect(content).toContain('Home');
    });

    it('should wrap route output with a document renderer before writing files', async () => {
      let seenContext: DocumentRenderContext | null = null;
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        document: ({ appHtml, context }) => {
          seenContext = context;
          return `<!doctype html><html><body data-path="${String(
            context.pathname
          )}">${appHtml}</body></html>`;
        },
      });

      const result = await ssg.generate();
      const indexFile = path.join(tempDir, 'index.html');
      const content = fs.readFileSync(indexFile, 'utf8');

      expect(result.routes[0].html).toBe(content);
      expect(content).toContain('<!doctype html>');
      expect(content).toContain('<body data-path="/">');
      expect(seenContext).toMatchObject({
        mode: 'ssg',
        url: '/',
        pathname: '/',
        search: '',
        hash: '',
        params: {},
        seed: 12345,
        route: {
          path: '/',
        },
      });
    });

    it('should generate HTML for nested routes', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/', component: Home },
          { path: '/about', component: About },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();

      const aboutFile = path.join(tempDir, 'about', 'index.html');
      expect(fs.existsSync(aboutFile)).toBe(true);
      const content = fs.readFileSync(aboutFile, 'utf8');
      expect(content).toContain('About Page');
    });

    it('should generate HTML for routes with parameters', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/blog/{slug}',
            component: BlogPost,
            params: { slug: 'hello-world' },
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();

      const blogFile = path.join(tempDir, 'blog', 'hello-world', 'index.html');
      expect(fs.existsSync(blogFile)).toBe(true);
      const content = fs.readFileSync(blogFile, 'utf8');
      expect(content).toContain('hello-world');
    });

    it('should expand parameterized routes from entries', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/blog/{slug}',
            component: BlogPost,
            entries: async () => [
              { slug: 'first-post' },
              { slug: 'second-post' },
            ],
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(2);
      expect(
        fs.existsSync(path.join(tempDir, 'blog', 'first-post', 'index.html'))
      ).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, 'blog', 'second-post', 'index.html'))
      ).toBe(true);
      expect(result.routes[0].html).toContain('first-post');
      expect(result.routes[1].html).toContain('second-post');
    });

    it('should reject route params that escape the output directory', async () => {
      const escapedFile = path.resolve(tempDir, '..', 'escaped', 'index.html');
      const ssg = createStaticGen({
        routes: [
          {
            path: '/{slug}',
            component: BlogPost,
            params: { slug: '../../escaped' },
          },
        ],
        outputDir: tempDir,
      });

      await expect(ssg.generate()).rejects.toThrow(
        'without dot segments or backslashes'
      );
      expect(fs.existsSync(escapedFile)).toBe(false);
    });

    it('should pass concrete paths and template paths to the SSG document renderer', async () => {
      const contexts: DocumentRenderContext[] = [];
      const ssg = createStaticGen({
        routes: [
          {
            path: '/blog/{slug}',
            component: BlogPost,
            entries: async () => [{ slug: 'first-post' }],
          },
        ],
        outputDir: tempDir,
        document: ({ appHtml, context }) => {
          contexts.push(context);
          return `<html><body>${appHtml}</body></html>`;
        },
      });

      const result = await ssg.generate();

      expect(contexts).toHaveLength(1);
      expect(contexts[0]).toMatchObject({
        mode: 'ssg',
        url: '/blog/first-post',
        pathname: '/blog/first-post',
        search: '',
        hash: '',
        params: { slug: 'first-post' },
        seed: 12345,
        route: {
          path: '/blog/{slug}',
        },
      });
      expect(result.routes[0].html).toContain('<html><body>');
      expect(result.routes[0].html).toContain('first-post');
    });

    it('should publish static assets in the same full-build replacement', async () => {
      const sourceDir = path.join(tempDir, 'client-assets');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'app.js'), 'console.log("app");');

      const result = await createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        assets: [{ from: sourceDir, to: 'assets' }],
      }).generate();

      expect(result.failed).toBe(0);
      expect(
        fs.readFileSync(path.join(tempDir, 'assets', 'app.js'), 'utf8')
      ).toBe('console.log("app");');
      expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(true);
    });

    it('should reject asset destinations outside outputDir', async () => {
      const sourcePath = path.join(tempDir, 'app.js');
      const escapedPath = path.resolve(tempDir, '..', 'escaped-app.js');
      fs.writeFileSync(sourcePath, 'console.log("app");');

      await expect(
        createStaticGen({
          routes: [{ path: '/', component: Home }],
          outputDir: tempDir,
          assets: [{ from: sourcePath, to: '../escaped-app.js' }],
        }).generate()
      ).rejects.toThrow('must stay inside outputDir');
      expect(fs.existsSync(escapedPath)).toBe(false);
    });

    it('should report a clear error when the document renderer returns a non-string', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        document: (() => Promise.resolve('<html></html>')) as never,
      });

      const result = await ssg.generate();

      expect(result.failed).toBe(1);
      expect(result.routes[0]).toMatchObject({
        status: 'error',
        error: expect.stringMatching(
          /document\(\) must synchronously return a string/i
        ),
      });
    });

    it('should render multiple routes', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/', component: Home },
          { path: '/about', component: About },
          {
            path: '/blog/{slug}',
            component: BlogPost,
            params: { slug: 'first-post' },
          },
          {
            path: '/blog/{slug}',
            component: BlogPost,
            params: { slug: 'second-post' },
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(4);
      expect(result.successful).toBe(4);
      expect(result.routes).toHaveLength(4);
      expect(result.routes.every((r) => r.status === 'success')).toBe(true);
    });

    it('should record render durations', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.routes[0].renderDuration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate file sizes after writing', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.routes[0].fileSize).toBeGreaterThan(0);
      expect(result.routes[0].fileSize).toBe(result.routes[0].html.length);
    });

    it('should count resources in data', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        dataOverrides: {
          '/': {
            posts: ['post1', 'post2'],
            users: ['user1'],
          },
        },
      });

      const result = await ssg.generate();

      expect(result.routes[0].resourceCount).toBe(2);
    });

    it('should include data overrides in render context', async () => {
      const DataComponent = (
        _props: unknown,
        ctx?: { ssr?: { data?: Record<string, unknown> } }
      ) => {
        const testData = ctx?.ssr?.data?.['test-key'];
        return <div>{testData || 'no data'}</div>;
      };

      const ssg = createStaticGen({
        routes: [{ path: '/', component: DataComponent }],
        outputDir: tempDir,
        dataOverrides: {
          '/': {
            'test-key': 'test-value',
          },
        },
      });

      const result = await ssg.generate();

      expect(result.routes[0].html).toContain('test-value');
    });

    it('should resolve data overrides by concrete path for entry-generated routes', async () => {
      const DataComponent = (
        _props: unknown,
        ctx?: { ssr?: { data?: Record<string, unknown> } }
      ) => <div>{String(ctx?.ssr?.data?.['title'] ?? 'no data')}</div>;

      const ssg = createStaticGen({
        routes: [
          {
            path: '/blog/{slug}',
            component: DataComponent,
            entries: async () => [{ slug: 'first-post' }],
          },
        ],
        outputDir: tempDir,
        dataOverrides: {
          '/blog/first-post': {
            title: 'entry-data',
          },
        },
      });

      const result = await ssg.generate();

      expect(result.routes[0].html).toContain('entry-data');
      expect(result.routes[0].resourceCount).toBe(1);
    });

    it('should skip authenticated routes as runtime-only during SSG', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/', component: Home },
          { path: '/dashboard', component: About, auth: requireUser() },
          {
            path: '/billing',
            component: About,
            policies: [() => ({ kind: 'allow' as const })],
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(2);
      expect(
        result.routes.find((route) => route.path === '/dashboard')
      ).toMatchObject({
        status: 'skipped',
        reason: 'runtime-only',
      });
      expect(
        result.routes.find((route) => route.path === '/billing')
      ).toMatchObject({
        status: 'skipped',
        reason: 'runtime-only',
      });
      expect(fs.existsSync(path.join(tempDir, 'dashboard', 'index.html'))).toBe(
        false
      );
    });

    it('should keep anonymous-only routes runtime-only during SSG', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/login', component: About, auth: requireAnonymous() },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'login', 'index.html'))).toBe(
        false
      );
    });

    it('should keep direct auth requirement routes runtime-only during SSG', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/login',
            component: About,
            auth: requireAnonymous(),
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'login', 'index.html'))).toBe(
        false
      );
    });

    it('should keep registry auth requirements runtime-only during SSG', async () => {
      const registry = createRouteRegistry(
        () => {
          route('/login', () => <main>{'Registry Login'}</main>, {
            auth: requireAnonymous(),
          });
        },
        {
          auth: {
            resolve: () => ({
              authenticated: false,
              principal: null,
              session: null,
              tenant: null,
            }),
          },
        }
      );
      const ssg = createStaticGen({
        registry,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.routes[0].path).toBe('/login');
      expect(fs.existsSync(path.join(tempDir, 'login', 'index.html'))).toBe(
        false
      );
    });

    it('should skip registry authenticated and custom-policy routes as runtime-only', async () => {
      const registry = createRouteRegistry(
        () => {
          route('/', () => <main>{'Registry Home'}</main>);
          route('/dashboard', () => <main>{'Dashboard'}</main>, {
            auth: requireUser(),
          });
          route('/billing', () => <main>{'Billing'}</main>, {
            policies: [() => ({ kind: 'allow' as const })],
          });
        },
        {
          auth: {
            resolve: () => ({
              authenticated: false,
              principal: null,
              session: null,
              tenant: null,
            }),
          },
        }
      );
      const ssg = createStaticGen({
        registry,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(2);
      expect(
        result.routes.find((route) => route.path === '/dashboard')
      ).toMatchObject({
        status: 'skipped',
        reason: 'runtime-only',
      });
      expect(
        result.routes.find((route) => route.path === '/billing')
      ).toMatchObject({
        status: 'skipped',
        reason: 'runtime-only',
      });
      expect(fs.existsSync(path.join(tempDir, 'dashboard', 'index.html'))).toBe(
        false
      );
    });

    it('should skip registry authenticated parameterized routes before param validation', async () => {
      const registry = createRouteRegistry(
        () => {
          route('/account/{id}', ({ id }) => <main>{id}</main>, {
            auth: requireUser(),
          });
        },
        {
          auth: {
            resolve: () => ({
              authenticated: false,
              principal: null,
              session: null,
              tenant: null,
            }),
          },
        }
      );
      const ssg = createStaticGen({
        registry,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(1);
      expect(result.successful).toBe(0);
      expect(result.skipped).toBe(1);
      expect(result.routes[0]).toMatchObject({
        path: '/account/{id}',
        status: 'skipped',
        reason: 'runtime-only',
      });
    });

    it('should reject entry routes with missing required path params', async () => {
      const invalidEntryRoute = {
        path: '/blog/{slug}',
        component: BlogPost,
        entries: async () =>
          [{ id: 'wrong-key' }] as unknown as Array<Record<string, string>>,
      } as RouteConfig;

      const ssg = createStaticGen({
        routes: [invalidEntryRoute],
        outputDir: tempDir,
      });

      await expect(ssg.generate()).rejects.toThrow(
        'route "/blog/{slug}" missing required param "slug"'
      );
    });

    it('should render mounted registry links while keeping logical SSG output paths', async () => {
      let loaderPathname = '';
      const registry = createRouteRegistry(
        () => {
          route(
            '/reviews/{slug}',
            ({ slug }) => (
              <main>
                {slug}
                <Link href="/about">About</Link>
              </main>
            ),
            {
              entries: () => [{ slug: 'book' }],
              loader: (context) => {
                loaderPathname = context.pathname;
                return { slug: context.params.slug };
              },
            }
          );
        },
        { basePath: '/website' }
      );
      const ssg = createStaticGen({ registry, outputDir: tempDir });

      const result = await ssg.generate();

      expect(result.failed).toBe(0);
      expect(loaderPathname).toBe('/reviews/book');
      const html = fs.readFileSync(
        path.join(tempDir, 'reviews/book/index.html'),
        'utf8'
      );
      expect(html).toContain('href="/website/about"');
      expect(fs.existsSync(path.join(tempDir, 'website'))).toBe(false);
    });
  });

  describe('metadata', () => {
    it('should generate metadata.json file', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();

      const metadataFile = path.join(tempDir, 'metadata.json');
      expect(fs.existsSync(metadataFile)).toBe(true);
    });

    it('should include correct metadata structure', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();
      const metadata = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'metadata.json'), 'utf8')
      );

      expect(metadata.generatedAt).toBeDefined();
      expect(new Date(metadata.generatedAt).toISOString()).toBe(
        metadata.generatedAt
      );
      expect(metadata.totalRoutes).toBe(1);
      expect(metadata.successful).toBe(1);
      expect(metadata.failed).toBe(0);
      expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
      expect(metadata.mode).toBe('full');
      expect(metadata.rebuilt).toBe(1);
      expect(metadata.skipped).toBe(0);
      expect(metadata.removed).toBe(0);
      expect(metadata.cacheHits).toBe(0);
      expect(metadata.invalidatedKeys).toEqual([]);
      expect(metadata.invalidatedRoutes).toEqual([]);
      expect(Array.isArray(metadata.routes)).toBe(true);
    });

    it('should include per-route details in metadata', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();
      const routeMetadata = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'metadata.json'), 'utf8')
      ).routes[0];

      expect(routeMetadata.path).toBe('/');
      expect(routeMetadata.filePath).toBe('index.html');
      expect(routeMetadata.fileSize).toBeGreaterThan(0);
      expect(routeMetadata.renderDuration).toBeGreaterThanOrEqual(0);
      expect(routeMetadata.resourceCount).toBeGreaterThanOrEqual(0);
      expect(routeMetadata.status).toBe('success');
      expect(routeMetadata.reason).toBe('full');
      expect(routeMetadata.written).toBe(true);
    });

    it('should leave full-build output untouched when a route fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const existingHtml = path.join(tempDir, 'index.html');
      fs.writeFileSync(existingHtml, '<main>previous site</main>');
      const BrokenComponent = (): JSXElement => {
        throw new Error('Render failed');
      };

      const ssg = createStaticGen({
        routes: [
          { path: '/', component: Home },
          { path: '/broken', component: BrokenComponent },
        ],
        outputDir: tempDir,
      });

      try {
        const result = await ssg.generate();

        expect(result.totalRoutes).toBe(2);
        expect(result.successful).toBe(1);
        expect(result.failed).toBe(1);
        expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
        expect(fs.readFileSync(existingHtml, 'utf8')).toBe(
          '<main>previous site</main>'
        );
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('should restore the previous site when the staged directory swap fails', async () => {
      const existingHtml = path.join(tempDir, 'index.html');
      fs.writeFileSync(existingHtml, '<main>previous site</main>');
      const stagingDir = path.join(path.dirname(tempDir), '.askr-staging-test');
      fs.mkdirSync(stagingDir, { recursive: true });
      fs.writeFileSync(
        path.join(stagingDir, 'index.html'),
        '<main>next site</main>'
      );
      const nativeRename = fs.promises.rename;

      try {
        await expect(
          replaceOutputDirectory(stagingDir, tempDir, {
            rename: async (from, to) => {
              if (from === stagingDir && to === tempDir) {
                throw new Error('staging swap failed');
              }
              await nativeRename(from, to);
            },
            rm: fs.promises.rm,
          })
        ).rejects.toThrow('staging swap failed');
        expect(fs.readFileSync(existingHtml, 'utf8')).toBe(
          '<main>previous site</main>'
        );
        expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
      } finally {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      }
    });

    it('should replace, rather than merge with, a previous site after a successful full build', async () => {
      fs.writeFileSync(path.join(tempDir, 'obsolete.html'), 'obsolete');
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();

      expect(fs.existsSync(path.join(tempDir, 'obsolete.html'))).toBe(false);
      expect(
        fs.readFileSync(path.join(tempDir, 'index.html'), 'utf8')
      ).toContain('Home');
    });

    it('should serialize full generations targeting the same output directory', async () => {
      let releaseFirst!: () => void;
      let markFirstStarted!: () => void;
      let secondStarted = false;
      const firstMayFinish = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      const firstStarted = new Promise<void>((resolve) => {
        markFirstStarted = resolve;
      });
      const first = createStaticGen({
        routes: [
          {
            path: '/',
            component: () => <main>first site</main>,
            loader: async () => {
              markFirstStarted();
              await firstMayFinish;
              return {};
            },
          },
        ],
        outputDir: tempDir,
      });
      const second = createStaticGen({
        routes: [
          {
            path: '/',
            component: () => <main>second site</main>,
            loader: async () => {
              secondStarted = true;
              return {};
            },
          },
        ],
        outputDir: tempDir,
      });

      const firstGeneration = first.generate();
      await firstStarted;
      const secondGeneration = second.generate();
      await new Promise((resolve) => setImmediate(resolve));
      const generationsOverlapped = secondStarted;
      releaseFirst();
      const generations = await Promise.allSettled([
        firstGeneration,
        secondGeneration,
      ]);

      expect(generationsOverlapped).toBe(false);
      expect(generations.map(({ status }) => status)).toEqual([
        'fulfilled',
        'fulfilled',
      ]);
      expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(true);
      expect(fs.readFileSync(path.join(tempDir, 'index.html'), 'utf8')).toContain(
        'second site'
      );
    });

    it('should reject dynamic and static routes that resolve to the same output file', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/posts/{slug}',
            params: { slug: 'intro' },
            component: BlogPost,
          },
          { path: '/posts/intro', component: About },
        ],
        outputDir: tempDir,
      });

      await expect(ssg.generate()).rejects.toThrow(
        /output path collision.*\/posts\/\{slug\}.*\/posts\/intro/i
      );
      expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
    });

    it('should reject case-only output path collisions on every host filesystem', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/Docs', component: Home },
          { path: '/docs', component: About },
        ],
        outputDir: tempDir,
      });

      await expect(ssg.generate()).rejects.toThrow(
        /output path collision.*\/Docs.*\/docs/i
      );
      expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
    });

    it('should preserve incremental HTML when its temporary write fails', async () => {
      const routeDir = path.join(tempDir, 'reports');
      const outputFile = path.join(routeDir, 'index.html');
      fs.mkdirSync(routeDir, { recursive: true });
      fs.writeFileSync(outputFile, '<main>previous report</main>');

      await expect(
        writeStaticFiles(
          [
            {
              path: '/reports',
              filePath: 'reports/index.html',
              html: '<main>next report</main>',
              fileSize: 24,
              renderDuration: 0,
              resourceCount: 0,
              status: 'success',
              reason: 'changed-route',
              written: true,
            },
          ],
          tempDir,
          {},
          {
            ...fs.promises,
            writeFile: async () => {
              throw new Error('temporary write failed');
            },
          }
        )
      ).rejects.toThrow('temporary write failed');

      expect(fs.readFileSync(outputFile, 'utf8')).toBe(
        '<main>previous report</main>'
      );
      expect(
        fs.readdirSync(routeDir).some((file) => file.endsWith('.tmp'))
      ).toBe(false);
    });

    it('should reject direct static writes outside outputDir', async () => {
      const escapedFile = path.resolve(tempDir, '..', 'escaped.html');
      await expect(
        writeStaticFiles(
          [
            {
              path: '/escaped',
              filePath: '../escaped.html',
              html: 'escaped',
              fileSize: 7,
              renderDuration: 0,
              resourceCount: 0,
              status: 'success',
              written: true,
            },
          ],
          tempDir
        )
      ).rejects.toThrow('must stay inside outputDir');
      expect(fs.existsSync(escapedFile)).toBe(false);

      await expect(
        writeStaticFiles(
          [
            {
              path: '/escaped',
              filePath: '../escaped.html',
              html: '',
              fileSize: 0,
              renderDuration: 0,
              resourceCount: 0,
              status: 'removed',
              written: false,
            },
          ],
          tempDir
        )
      ).rejects.toThrow('must stay inside outputDir');
    });

    it('should return failed route errors without publishing partial metadata', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const BrokenComponent = (): JSXElement => {
        throw new Error('Test error message');
      };

      const ssg = createStaticGen({
        routes: [{ path: '/broken', component: BrokenComponent }],
        outputDir: tempDir,
      });

      try {
        const result = await ssg.generate();
        const failedRoute = result.routes[0];

        expect(failedRoute.status).toBe('error');
        expect(failedRoute.error).toContain('Test error message');
        expect(failedRoute.errorCause).toBeInstanceOf(Error);
        expect(failedRoute.errorContext).toEqual({
          route: '/broken',
          phase: 'render',
        });
        expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        warn.mockRestore();
      }
    });

    it('should report render phase when a loader succeeds before component failure', async () => {
      const BrokenComponent = (): JSXElement => {
        throw new Error('render failure');
      };
      const result = await createStaticGen({
        routes: [
          {
            path: '/loaded-broken',
            component: BrokenComponent,
            loader: async () => ({ ok: true }),
          },
        ],
        outputDir: tempDir,
      }).generate();

      expect(result.routes[0].errorContext).toEqual({
        route: '/loaded-broken',
        phase: 'render',
      });
    });

    it('should write metadata JSON with proper formatting', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();

      const metadataFile = path.join(tempDir, 'metadata.json');
      const raw = fs.readFileSync(metadataFile, 'utf8');
      const parsed = JSON.parse(raw);

      expect(parsed).toBeDefined();
      expect(parsed.totalRoutes).toBeGreaterThan(0);
      // Check that it's formatted (has newlines)
      expect(raw).toContain('\n');
    });
  });

  describe('edge cases', () => {
    it('should handle trailing slashes correctly', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/about/', component: About },
          { path: '/contact/', component: () => <div>Contact</div> },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();

      // Both should generate in about/ and contact/ directories
      const aboutFile = path.join(tempDir, 'about', 'index.html');
      const contactFile = path.join(tempDir, 'contact', 'index.html');

      expect(fs.existsSync(aboutFile)).toBe(true);
      expect(fs.existsSync(contactFile)).toBe(true);
    });

    it('should handle deeply nested routes', async () => {
      const DeepComponent = (): JSXElement => <div>Deep</div>;

      const ssg = createStaticGen({
        routes: [
          {
            path: '/docs/guides/advanced/nested/deep',
            component: DeepComponent,
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();

      const deepFile = path.join(
        tempDir,
        'docs',
        'guides',
        'advanced',
        'nested',
        'deep',
        'index.html'
      );
      expect(fs.existsSync(deepFile)).toBe(true);
    });

    it('should handle empty data overrides', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        dataOverrides: {},
      });

      const result = await ssg.generate();

      expect(result.failed).toBe(0);
      expect(result.routes[0].resourceCount).toBe(0);
    });

    it('should render synchronous resource routes without data overrides', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: SyncResourcePage }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const indexFile = path.join(tempDir, 'index.html');
      const content = fs.readFileSync(indexFile, 'utf8');

      expect(result.successful).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.routes[0].html).toBe('<main>loaded</main>');
      expect(result.routes[0].resourceCount).toBe(0);
      expect(content).toBe('<main>loaded</main>');
    });

    it('should keep explicit empty-object data overrides in SSR-data mode', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: SyncResourcePage }],
        outputDir: tempDir,
        dataOverrides: {
          '/': {},
        },
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.routes[0].status).toBe('error');
      expect(result.routes[0].resourceCount).toBe(0);
      expect(result.routes[0].error).toMatch(
        /Server-side rendering requires all data to be available synchronously/
      );
    });

    it('should use custom seed for deterministic generation', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', component: Home }],
        outputDir: tempDir,
        seed: 12345,
      });

      await ssg.generate();
      // Seed should be passed through to render context
      expect(ssg.getConfig().seed).toBe(12345);
    });
  });

  describe('concurrent rendering', () => {
    it('should render multiple routes in parallel', async () => {
      const routes: RouteConfig[] = Array.from({ length: 5 }, (_, i) => ({
        path: `/page-${i}`,
        component: () => <div>Page {i}</div>,
      }));

      const ssg = createStaticGen({
        routes,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(5);
      expect(result.successful).toBe(5);
    });
  });

  describe('incremental generation', () => {
    it('should write an incremental manifest alongside HTML and metadata', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();

      expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(true);
      expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(true);
      expect(
        fs.existsSync(path.join(tempDir, '.askr', 'ssg-manifest.json'))
      ).toBe(true);

      const manifest = readManifest(tempDir);
      expect(manifest.schemaVersion).toBe(SSG_MANIFEST_SCHEMA_VERSION);
      expect(manifest.seed).toBe(12345);
      expect(manifest.mode).toBe('full');
      expect(manifest.routes).toHaveLength(1);
      expect(manifest.routes[0].path).toBe('/');
      expect(manifest.routes[0].invalidationKeys).toEqual(['home']);
    });

    it('should rebuild only routes matching changed invalidation keys', async () => {
      let homeRenders = 0;
      let aboutRenders = 0;

      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            invalidationKeys: ['home'],
            component: () => {
              homeRenders += 1;
              return <div>Home</div>;
            },
          },
          {
            path: '/about',
            invalidationKeys: ['about'],
            component: () => {
              aboutRenders += 1;
              return <div>About</div>;
            },
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();
      homeRenders = 0;
      aboutRenders = 0;

      const result = await ssg.generate({
        mode: 'incremental',
        changedKeys: ['about'],
      });

      expect(homeRenders).toBe(0);
      expect(aboutRenders).toBe(1);
      expect(result.mode).toBe('incremental');
      expect(result.rebuilt).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.invalidatedKeys).toEqual(['about']);
      expect(result.routes.find((route) => route.path === '/')?.status).toBe(
        'skipped'
      );
      expect(
        result.routes.find((route) => route.path === '/about')?.reason
      ).toBe('changed-key');
    });

    it('should rebuild only concrete routes matching changed route paths', async () => {
      let firstRenders = 0;
      let secondRenders = 0;

      const ssg = createStaticGen({
        routes: [
          {
            path: '/blog/{slug}',
            params: { slug: 'first' },
            invalidationKeys: ['blog:first'],
            component: (props: { slug?: string }) => {
              firstRenders += 1;
              return <div>{props.slug}</div>;
            },
          },
          {
            path: '/blog/{slug}',
            params: { slug: 'second' },
            invalidationKeys: ['blog:second'],
            component: (props: { slug?: string }) => {
              secondRenders += 1;
              return <div>{props.slug}</div>;
            },
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();
      firstRenders = 0;
      secondRenders = 0;

      const result = await ssg.generate({
        mode: 'incremental',
        changedRoutes: ['/blog/second'],
      });

      expect(firstRenders).toBe(0);
      expect(secondRenders).toBe(1);
      expect(result.invalidatedRoutes).toEqual(['/blog/second']);
      expect(
        result.routes.find((route) => route.path === '/blog/first')?.status
      ).toBe('skipped');
      expect(
        result.routes.find((route) => route.path === '/blog/second')?.reason
      ).toBe('changed-route');
    });

    it('should always rebuild routes without invalidation keys during incremental runs', async () => {
      let alwaysDirtyRenders = 0;
      let keyedRenders = 0;

      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: () => {
              alwaysDirtyRenders += 1;
              return <div>Always dirty</div>;
            },
          },
          {
            path: '/about',
            invalidationKeys: ['about'],
            component: () => {
              keyedRenders += 1;
              return <div>Keyed</div>;
            },
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();
      alwaysDirtyRenders = 0;
      keyedRenders = 0;

      const result = await ssg.generate({ mode: 'incremental' });

      expect(alwaysDirtyRenders).toBe(1);
      expect(keyedRenders).toBe(0);
      expect(result.rebuilt).toBe(1);
      expect(result.skipped).toBe(1);
      expect(result.routes.find((route) => route.path === '/')?.reason).toBe(
        'no-keys'
      );
    });

    it('should remove stale routes from output and manifest entries', async () => {
      const initial = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
          {
            path: '/stale',
            component: () => <div>Stale</div>,
            invalidationKeys: ['stale'],
          },
        ],
        outputDir: tempDir,
      });

      await initial.generate();
      expect(fs.existsSync(path.join(tempDir, 'stale', 'index.html'))).toBe(
        true
      );

      const updated = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
        ],
        outputDir: tempDir,
      });

      const result = await updated.generate({ mode: 'incremental' });

      expect(result.removed).toBe(1);
      expect(fs.existsSync(path.join(tempDir, 'stale', 'index.html'))).toBe(
        false
      );
      expect(result.routes.at(-1)?.status).toBe('removed');
      const manifest = readManifest(tempDir);
      expect(manifest.routes.map((route) => route.path)).toEqual(['/']);
    });

    it('should avoid rewriting unchanged rebuilt output and report cache hits', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: () => <div>Stable</div>,
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();
      const before = fs.statSync(path.join(tempDir, 'index.html')).mtimeMs;

      const result = await ssg.generate({ mode: 'incremental' });
      const after = fs.statSync(path.join(tempDir, 'index.html')).mtimeMs;

      expect(result.cacheHits).toBe(1);
      expect(result.routes[0].status).toBe('success');
      expect(result.routes[0].written).toBe(false);
      expect(result.routes[0].reason).toBe('no-keys');
      expect(after).toBe(before);
    });

    it('should preserve prior HTML when an incremental rebuild fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const initial = createStaticGen({
        routes: [
          {
            path: '/broken',
            component: () => <div>stable</div>,
            invalidationKeys: ['broken'],
          },
        ],
        outputDir: tempDir,
      });

      await initial.generate();
      const beforeHtml = fs.readFileSync(
        path.join(tempDir, 'broken', 'index.html'),
        'utf8'
      );
      const beforeManifest = readManifest(tempDir);

      const failing = createStaticGen({
        routes: [
          {
            path: '/broken',
            component: () => {
              throw new Error('boom');
            },
            invalidationKeys: ['broken'],
          },
        ],
        outputDir: tempDir,
      });

      try {
        const result = await failing.generate({
          mode: 'incremental',
          changedKeys: ['broken'],
        });

        expect(result.failed).toBe(1);
        expect(result.routes[0].status).toBe('error');
        expect(result.routes[0].written).toBe(false);
        expect(
          fs.readFileSync(path.join(tempDir, 'broken', 'index.html'), 'utf8')
        ).toBe(beforeHtml);

        const afterManifest = readManifest(tempDir);
        expect(afterManifest.routes[0].lastStatus).toBe('error');
        expect(afterManifest.routes[0].htmlHash).toBe(
          beforeManifest.routes[0].htmlHash
        );
        expect(warn).toHaveBeenCalledWith(
          'Skipping failed route: /broken - boom'
        );
      } finally {
        warn.mockRestore();
      }
    });

    it('should fall back to a full build when incremental mode has no manifest', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
          {
            path: '/about',
            component: About,
            invalidationKeys: ['about'],
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate({
        mode: 'incremental',
        changedKeys: ['home'],
      });

      expect(result.mode).toBe('full');
      expect(result.rebuilt).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should not claim successful routes were written when a fallback full build fails', async () => {
      const BrokenComponent = (): JSXElement => {
        throw new Error('fallback render failed');
      };
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
          {
            path: '/broken',
            component: BrokenComponent,
            invalidationKeys: ['broken'],
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate({
        mode: 'incremental',
        changedKeys: ['home'],
      });

      expect(result.mode).toBe('full');
      expect(result.failed).toBe(1);
      expect(result.routes.find((route) => route.path === '/')?.written).toBe(
        false
      );
      expect(fs.existsSync(path.join(tempDir, 'index.html'))).toBe(false);
      expect(fs.existsSync(path.join(tempDir, 'metadata.json'))).toBe(false);
    });

    it('should fall back to a full build when the manifest schema is invalid', async () => {
      const ssg = createStaticGen({
        routes: [
          {
            path: '/',
            component: Home,
            invalidationKeys: ['home'],
          },
          {
            path: '/about',
            component: About,
            invalidationKeys: ['about'],
          },
        ],
        outputDir: tempDir,
      });

      await ssg.generate();
      const manifestPath = path.join(tempDir, '.askr', 'ssg-manifest.json');
      const manifest = readManifest(tempDir);
      manifest.schemaVersion = 999;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      const result = await ssg.generate({
        mode: 'incremental',
        changedKeys: ['about'],
      });

      expect(result.mode).toBe('full');
      expect(result.rebuilt).toBe(2);
      expect(result.skipped).toBe(0);
    });

    it('should reject poisoned manifest paths without deleting outside outputDir', async () => {
      const escapedFile = path.resolve(
        tempDir,
        '..',
        `askr-manifest-poison-${path.basename(tempDir)}.html`
      );
      fs.writeFileSync(escapedFile, 'must survive', 'utf8');
      try {
        const initial = createStaticGen({
          routes: [
            {
              path: '/',
              component: Home,
              invalidationKeys: ['home'],
            },
            {
              path: '/stale',
              component: About,
              invalidationKeys: ['stale'],
            },
          ],
          outputDir: tempDir,
        });
        await initial.generate();

        const manifestPath = path.join(tempDir, '.askr', 'ssg-manifest.json');
        const manifest = readManifest(tempDir);
        const stale = manifest.routes.find((route) => route.path === '/stale');
        if (!stale) throw new Error('Expected stale manifest route');
        stale.filePath = path.relative(tempDir, escapedFile);
        fs.writeFileSync(
          manifestPath,
          JSON.stringify(manifest, null, 2),
          'utf8'
        );

        const updated = createStaticGen({
          routes: [
            {
              path: '/',
              component: Home,
              invalidationKeys: ['home'],
            },
          ],
          outputDir: tempDir,
        });
        const result = await updated.generate({ mode: 'incremental' });

        expect(result.mode).toBe('full');
        expect(result.removed).toBe(0);
        expect(fs.readFileSync(escapedFile, 'utf8')).toBe('must survive');
      } finally {
        fs.rmSync(escapedFile, { force: true });
      }
    });
  });
});
