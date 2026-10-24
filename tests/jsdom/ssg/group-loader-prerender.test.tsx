import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import { cleanupApp, hydrateSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  group,
  layoutData,
  Outlet,
  page,
  route,
  routeData,
} from '../../../src/router';
import { createStaticGen } from '../../../src/ssg';
import { resetRouteState } from '../../router-test-utils';

const directories: string[] = [];
afterEach(() => {
  resetRouteState();
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

async function generate(registry: ReturnType<typeof createRouteRegistry>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-group-'));
  directories.push(root);
  const outputDir = path.join(root, 'dist');
  const result = await createStaticGen({ registry, outputDir }).generate();
  return { result, outputDir };
}

describe('SSG with group and page loaders', () => {
  it('should prerender a route under a group loader with layoutData resolved', async () => {
    const loader = async () => ({ nav: ['a', 'b'] });
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group(
        {
          loader,
          layout: ({ children }: { children?: unknown }) => (
            <div>
              {`nav:${layoutData(loader).nav.length}`}
              {children as never}
            </div>
          ),
        },
        () => {
          route('/docs', () => <p>docs</p>);
        }
      );
    });
    const { result, outputDir } = await generate(registry);
    const docs = result.routes.find((entry) => entry.path === '/docs');
    expect(docs?.status).toBe('success');
    const html = fs.readFileSync(
      path.join(outputDir, 'docs/index.html'),
      'utf8'
    );
    expect(html).toContain('nav:2');
    expect(html).toContain('<p>docs</p>');
    expect(html).toContain('"rl":[{"nav":["a","b"]}]');
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
  });

  it('should run group, page and leaf loaders together, outermost first, with the request context', async () => {
    const events: string[] = [];
    const seen: Array<{ mode: string; id: string | undefined }> = [];
    const release: Array<() => void> = [];
    const gate = (name: string) =>
      new Promise<string>((resolve) => {
        release.push(() => resolve(name));
      });
    const outer = async (context: {
      mode: string;
      params: { id?: string };
    }) => {
      events.push('outer');
      seen.push({ mode: context.mode, id: context.params.id });
      return gate('outer');
    };
    const inner = async () => {
      events.push('inner');
      return gate('inner');
    };
    const leaf = async () => {
      events.push('leaf');
      return gate('leaf');
    };
    const registry = createRouteRegistry(() => {
      group({ loader: outer as never }, () => {
        page(
          '/docs',
          () => (
            <section>
              {`${layoutData(outer as never)}-${layoutData(inner as never)}`}
              <Outlet />
            </section>
          ),
          { loader: inner as never },
          () => {
            route('{id}', () => <p>{routeData<string>()}</p>, {
              loader: leaf as never,
              entries: () => [{ id: '7' }],
            });
          }
        );
      });
    });
    const pending = generate(registry);
    await new Promise((resolve) => setTimeout(resolve, 20));
    // All three started before any settled: they ran in parallel.
    expect(events).toEqual(['outer', 'inner', 'leaf']);
    for (const done of release) done();
    const { result, outputDir } = await pending;
    expect(result.routes[0]?.status).toBe('success');
    const html = fs.readFileSync(
      path.join(outputDir, 'docs/7/index.html'),
      'utf8'
    );
    expect(html).toContain('outer-inner');
    expect(html).toContain('<p>leaf</p>');
    expect(seen).toEqual([{ mode: 'ssg', id: '7' }]);
  });

  it('should hydrate a prerendered page with group loader data', async () => {
    const loader = async () => ({ title: 'Docs' });
    const registry = createRouteRegistry(() => {
      group(
        {
          loader,
          layout: ({ children }: { children?: unknown }) => (
            <div>
              <h1>{layoutData(loader).title}</h1>
              {children as never}
            </div>
          ),
        },
        () => {
          route('/docs', () => <p>docs</p>);
        }
      );
    });
    const { outputDir } = await generate(registry);
    const html = fs.readFileSync(
      path.join(outputDir, 'docs/index.html'),
      'utf8'
    );
    const root = document.body.appendChild(document.createElement('div'));
    root.innerHTML = html;
    window.history.replaceState({}, '', '/docs');
    try {
      await hydrateSPA({ root, registry, hydrate: { verifyMarkup: true } });
      expect(root.querySelector('h1')?.textContent).toBe('Docs');
    } finally {
      cleanupApp(root);
      root.remove();
    }
  });
});
