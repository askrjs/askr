import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { createStaticGen } from '../../src/ssr/create-static-gen';
import type { SSGRouteConfig } from '../../src/ssr/static-gen-types';
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

// Test components
const Home = (): JSXElement => <div>Home</div>;

const About = (): JSXElement => <div>About Page</div>;

const BlogPost = (props: { slug?: string }): JSXElement => (
  <div>
    <h1>Blog Post</h1>
    <p>Slug: {props.slug}</p>
  </div>
);

const NotFound = (): JSXElement => <div>404 Not Found</div>;

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
          routes: [{ path: '/', handler: Home }],
          outputDir: '',
        })
      ).toThrow('outputDir is required');
    });

    it('should return a generator with expected methods', () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      expect(ssg.generate).toBeDefined();
      expect(typeof ssg.generate).toBe('function');
      expect(ssg.getConfig).toBeDefined();
      expect(ssg.getRoutes).toBeDefined();
    });

    it('should expose generator config', () => {
      const routes = [{ path: '/', handler: Home }];
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

    it('should expose routes', () => {
      const routes = [{ path: '/', handler: Home }];
      const ssg = createStaticGen({
        routes,
        outputDir: tempDir,
      });

      expect(ssg.getRoutes()).toEqual(routes);
    });
  });

  describe('generation', () => {
    it('should generate static HTML for a single route', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.success).toBe(true);
      expect(result.metadata.totalRoutes).toBe(1);
      expect(result.metadata.successful).toBe(1);
      expect(result.metadata.failed).toBe(0);
      expect(result.routes).toHaveLength(1);
      expect(result.routes[0].status).toBe('success');
      expect(result.routes[0].html).toContain('<div');
      expect(result.routes[0].html).toContain('Home');
    });

    it('should generate HTML files in correct directory structure', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
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
          { path: '/', handler: Home },
          { path: '/about', handler: About },
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
            handler: BlogPost,
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
          { path: '/', handler: Home },
          { path: '/about', handler: About },
          {
            path: '/blog/{slug}',
            handler: BlogPost,
            params: { slug: 'first-post' },
          },
          {
            path: '/blog/{slug}',
            handler: BlogPost,
            params: { slug: 'second-post' },
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.metadata.totalRoutes).toBe(4);
      expect(result.metadata.successful).toBe(4);
      expect(result.routes).toHaveLength(4);
      expect(result.routes.every((r) => r.status === 'success')).toBe(true);
    });

    it('should record render durations', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.routes[0].renderDuration).toBeGreaterThanOrEqual(0);
    });

    it('should calculate file sizes after writing', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.routes[0].fileSize).toBeGreaterThan(0);
      expect(result.routes[0].fileSize).toBe(result.routes[0].html.length);
    });

    it('should count resources in data', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
        dataOverrides: {
          posts: ['post1', 'post2'],
          users: ['user1'],
        },
      });

      const result = await ssg.generate();

      expect(result.routes[0].resourceCount).toBe(2);
    });

    it('should include data overrides in render context', async () => {
      const DataComponent = (props: any, ctx: any) => {
        const testData = ctx?.ssr?.data?.['test-key'];
        return <div>{testData || 'no data'}</div>;
      };

      const ssg = createStaticGen({
        routes: [{ path: '/', handler: DataComponent }],
        outputDir: tempDir,
        dataOverrides: {
          'test-key': 'test-value',
        },
      });

      const result = await ssg.generate();

      expect(result.routes[0].html).toContain('test-value');
    });
  });

  describe('metadata', () => {
    it('should generate metadata.json file', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      await ssg.generate();

      const metadataFile = path.join(tempDir, 'metadata.json');
      expect(fs.existsSync(metadataFile)).toBe(true);
    });

    it('should include correct metadata structure', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const metadata = result.metadata;

      expect(metadata.generatedAt).toBeDefined();
      expect(new Date(metadata.generatedAt).toISOString()).toBe(
        metadata.generatedAt
      );
      expect(metadata.totalRoutes).toBe(1);
      expect(metadata.successful).toBe(1);
      expect(metadata.failed).toBe(0);
      expect(metadata.totalDuration).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(metadata.routes)).toBe(true);
    });

    it('should include per-route details in metadata', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const routeMetadata = result.metadata.routes[0];

      expect(routeMetadata.path).toBe('/');
      expect(routeMetadata.filePath).toBe('index.html');
      expect(routeMetadata.fileSize).toBeGreaterThan(0);
      expect(routeMetadata.renderDuration).toBeGreaterThanOrEqual(0);
      expect(routeMetadata.resourceCount).toBeGreaterThanOrEqual(0);
      expect(routeMetadata.status).toBe('success');
    });

    it('should track failed routes in metadata', async () => {
      const BrokenComponent = (): JSXElement => {
        throw new Error('Render failed');
      };

      const ssg = createStaticGen({
        routes: [
          { path: '/', handler: Home },
          { path: '/broken', handler: BrokenComponent },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.metadata.totalRoutes).toBe(2);
      expect(result.metadata.successful).toBe(1);
      expect(result.metadata.failed).toBe(1);
      expect(result.success).toBe(false);
    });

    it('should record error messages for failed routes', async () => {
      const BrokenComponent = (): JSXElement => {
        throw new Error('Test error message');
      };

      const ssg = createStaticGen({
        routes: [{ path: '/broken', handler: BrokenComponent }],
        outputDir: tempDir,
      });

      const result = await ssg.generate();
      const failedRoute = result.metadata.routes[0];

      expect(failedRoute.status).toBe('error');
      expect(failedRoute.error).toContain('Test error message');
    });

    it('should write metadata JSON with proper formatting', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
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
          { path: '/about/', handler: About },
          { path: '/contact/', handler: () => <div>Contact</div> },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

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
            handler: DeepComponent,
          },
        ],
        outputDir: tempDir,
      });

      const result = await ssg.generate();

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
        routes: [{ path: '/', handler: Home }],
        outputDir: tempDir,
        dataOverrides: {},
      });

      const result = await ssg.generate();

      expect(result.success).toBe(true);
      expect(result.routes[0].resourceCount).toBe(0);
    });

    it('should use custom seed for deterministic generation', async () => {
      const ssg = createStaticGen({
        routes: [{ path: '/', handler: Home }],
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
      const routes: SSGRouteConfig[] = Array.from({ length: 5 }, (_, i) => ({
        path: `/page-${i}`,
        handler: () => <div>Page {i}</div>,
      }));

      const ssg = createStaticGen({
        routes,
        outputDir: tempDir,
      });

      const result = await ssg.generate();

      expect(result.metadata.totalRoutes).toBe(5);
      expect(result.metadata.successful).toBe(5);
    });
  });
});
