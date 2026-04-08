import { describe, it, expect, beforeEach, afterEach } from 'vite-plus/test';
import * as fs from 'fs';
import * as path from 'path';
import { createStaticGen } from '../../src/ssg/create-static-gen';
import { SSG_MANIFEST_SCHEMA_VERSION } from '../../src/ssg/incremental-manifest';
import type { RouteConfig } from '../../src/ssg/types';
import type { JSXElement } from '../../src/jsx/types';

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

describe('Static Site Generation', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    cleanupTempDir(tempDir);
  });

  describe('createStaticGen', () => {
    it('should throw if no routes provided', () => {
      expect(() =>
        createStaticGen({
          routes: [],
          outputDir: tempDir,
        })
      ).toThrow('routes array is required');
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

    it('should skip authenticated routes as runtime-only during SSG', async () => {
      const ssg = createStaticGen({
        routes: [
          { path: '/', component: Home },
          { path: '/dashboard', component: About, auth: true },
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

    it('should keep guest routes prerenderable during SSG', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/login', component: About, auth: 'guest' }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.successful).toBe(1);
      expect(result.skipped).toBe(0);
      expect(fs.existsSync(path.join(tempDir, 'login', 'index.html'))).toBe(
        true
      );
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

    it('should track failed routes in metadata', async () => {
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

      const result = await ssg.generate();

      expect(result.totalRoutes).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
    });

    it('should record error messages for failed routes', async () => {
      const BrokenComponent = (): JSXElement => {
        throw new Error('Test error message');
      };

      const ssg = createStaticGen({
        routes: [{ path: '/broken', component: BrokenComponent }],
        outputDir: tempDir,
      });

      await ssg.generate();
      const failedRoute = JSON.parse(
        fs.readFileSync(path.join(tempDir, 'metadata.json'), 'utf8')
      ).routes[0];

      expect(failedRoute.status).toBe('error');
      expect(failedRoute.error).toContain('Test error message');
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
  });
});
