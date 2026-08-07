import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  lazyRouteData,
  route,
  routeData,
} from '../../../src/router';
import { createStaticGen } from '../../../src/ssg';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function outputDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-lazy-data-'));
  directories.push(root);
  return path.join(root, 'dist');
}

describe('SSG lazy route data', () => {
  it('should resolve the route loader and hydrate only selected content', async () => {
    const loadContent = lazyRouteData(
      () => import('../../fixtures/docs-content'),
      (module, context) => ({
        page: module.docs[context.params.page as keyof typeof module.docs],
        catalog: module.docs,
      })
    );
    const registry = createRouteRegistry(() => {
      route(
        '/docs/{page}',
        () => {
          const data = routeData<{
            page: { title: string; body: string };
            catalog: object;
          }>();
          return (
            <article>
              <h1>{data.page.title}</h1>
              <p>{data.page.body}</p>
            </article>
          );
        },
        {
          loader: loadContent,
          dehydrate: (data) => ({ page: data.page }),
          entries: () => [{ page: 'introduction' }],
          meta: {
            title: 'Documentation',
            description: 'Static route metadata stays in the route manifest.',
          },
        }
      );
    });
    const outputDir = outputDirectory();

    const result = await createStaticGen({ registry, outputDir }).generate();
    const html = fs.readFileSync(
      path.join(outputDir, 'docs/introduction/index.html'),
      'utf8'
    );

    expect(result.failed).toBe(0);
    expect(html).toContain('Matched introduction content');
    expect(html).not.toContain('Unrelated deployment content');
    const payload = JSON.parse(
      html.match(
        /<script type="application\/json" data-askr-render-data="true">([^<]+)<\/script>/
      )?.[1] ?? '{}'
    );
    expect(payload.route).toEqual({
      page: {
        title: 'Introduction',
        body: 'Matched introduction content',
      },
    });
  });

  it('should report the SSG load phase and route for import failures', async () => {
    const registry = createRouteRegistry(() => {
      route('/docs/broken', () => null, {
        loader: lazyRouteData(async () => {
          throw new Error('content import failed');
        }),
      });
    });

    const result = await createStaticGen({
      registry,
      outputDir: outputDirectory(),
    }).generate();

    expect(result.routes[0]).toMatchObject({
      path: '/docs/broken',
      status: 'error',
      errorContext: {
        route: '/docs/broken',
        phase: 'load',
      },
    });
    expect(result.routes[0].error).toContain(
      'during ssg loading: content import failed'
    );
    expect(result.routes[0].errorCause).toEqual(
      new Error('content import failed')
    );
  });
});
