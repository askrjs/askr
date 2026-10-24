import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import { createRouteRegistry, fallback, route } from '../../../src/router';
import { createStaticGen } from '../../../src/ssg';
import { serializeRouteMeta } from '../../../src/router/metadata';
import {
  defineQuery,
  defineServerQueries,
  serveQuery,
} from '../../../src/data';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
function outputDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-policies-'));
  directories.push(root);
  return path.join(root, 'dist');
}

describe('SSG output policies', () => {
  it('should skip a parameterized route without entries as runtime-only', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      route('/users/{id}', () => <p>user</p>);
    });
    const outputDir = outputDirectory();
    const result = await createStaticGen({ registry, outputDir }).generate();
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
    const skipped = result.routes.find((entry) => entry.path === '/users/{id}');
    expect(skipped?.status).toBe('skipped');
    expect(skipped?.reason).toBe('runtime-only');
    expect(skipped?.error).toContain('entries()');
  });

  it('should pass resolved route metadata to the document renderer', async () => {
    const registry = createRouteRegistry(() => {
      route('/about', () => <p>about</p>, {
        meta: { title: 'About us', description: 'Who we are' },
      });
    });
    const outputDir = outputDirectory();
    const document = vi.fn(
      ({ appHtml, context }: { appHtml: string; context: { meta?: object } }) =>
        `<!doctype html><html><head>${serializeRouteMeta(context.meta ?? {})}</head><body>${appHtml}</body></html>`
    );
    await createStaticGen({ registry, outputDir, document }).generate();
    const html = fs.readFileSync(
      path.join(outputDir, 'about', 'index.html'),
      'utf8'
    );
    expect(html).toContain('<title');
    expect(html).toContain('About us');
    expect(html).toContain('Who we are');
    expect(document.mock.calls[0][0].context.meta).toMatchObject({
      title: 'About us',
    });
  });

  it('should pass resolved leaf loader data to metadata sources', async () => {
    const registry = createRouteRegistry(() => {
      route('/about', () => <p>about</p>, {
        loader: async () => ({ title: 'Loaded title' }),
        meta: ({ data }) => ({ title: (data as { title: string }).title }),
      });
    });
    const outputDir = outputDirectory();
    const document = vi.fn(({ appHtml }: { appHtml: string }) => appHtml);
    const result = await createStaticGen({
      registry,
      outputDir,
      document,
    }).generate();
    expect(result.routes[0]?.status).toBe('success');
    expect(document).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          meta: expect.objectContaining({ title: 'Loaded title' }),
        }),
      })
    );
  });

  it('should run the route preload and embed its query data', async () => {
    const query = defineQuery({
      key: () => 'greeting',
      fetch: async () => 'prefetched-greeting',
    });
    const preload = vi.fn(
      async ({ data }: { data: { prefetch: Function } }) => {
        await data.prefetch(query, {});
      }
    );
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>, { preload: preload as never });
    });
    const outputDir = outputDirectory();
    const queryRegistry = defineServerQueries(
      serveQuery(query, () => 'prefetched-greeting')
    );
    await createStaticGen({ registry, outputDir, queryRegistry }).generate();
    expect(preload).toHaveBeenCalledTimes(1);
    const html = fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8');
    expect(html).toContain('prefetched-greeting');
  });

  it('should write the root fallback as 404.html', async () => {
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      fallback(() => <p>not found here</p>);
    });
    const outputDir = outputDirectory();
    const result = await createStaticGen({ registry, outputDir }).generate();
    const notFound = path.join(outputDir, '404.html');
    expect(fs.existsSync(notFound)).toBe(true);
    expect(fs.readFileSync(notFound, 'utf8')).toContain('not found here');
    expect(fs.existsSync(path.join(outputDir, '404', 'index.html'))).toBe(
      false
    );
    expect(result.routes.some((entry) => entry.filePath === '404.html')).toBe(
      true
    );
  });
});
