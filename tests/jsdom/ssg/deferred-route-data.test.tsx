import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  defer,
  Resolve,
  route,
  routeData,
} from '../../../src/router';
import type { Deferred } from '../../../src/router';
import { createStaticGen } from '../../../src/ssg';

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function outputDirectory(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-deferred-ssg-'));
  directories.push(root);
  return path.join(root, 'dist');
}

describe('SSG deferred route data', () => {
  it('should preserve primitive loader output in the route envelope', async () => {
    const registry = createRouteRegistry(() => {
      route('/primitive', () => <p>{routeData<string>()}</p>, {
        loader: () => 'ready',
      });
    });
    const outputDir = outputDirectory();

    const result = await createStaticGen({ registry, outputDir }).generate();

    expect(result.failed).toBe(0);
    const html = fs.readFileSync(
      path.join(outputDir, 'primitive/index.html'),
      'utf8'
    );
    expect(html).toContain('<p>ready</p>');
    expect(html).toContain('"route":"ready"');
  });

  it('should await deferred loader values before writing static HTML', async () => {
    const registry = createRouteRegistry(() => {
      route(
        '/deferred',
        () => {
          const data = routeData<{ message: Deferred<string> }>();
          return (
            <Resolve value={data.message} pending={<p>pending</p>}>
              {(message) => <p>{message}</p>}
            </Resolve>
          );
        },
        { loader: () => ({ message: defer(Promise.resolve('ready')) }) }
      );
    });
    const outputDir = outputDirectory();

    const result = await createStaticGen({ registry, outputDir }).generate();

    expect(result.failed).toBe(0);
    expect(
      fs.readFileSync(path.join(outputDir, 'deferred/index.html'), 'utf8')
    ).toContain('<p>ready</p>');
  });

  it('should preserve the previous site when deferred loader data rejects', async () => {
    const registry = createRouteRegistry(() => {
      route('/broken', () => null, {
        loader: () => ({
          value: defer(Promise.reject(new Error('load failed'))),
        }),
      });
    });
    const outputDir = outputDirectory();
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, 'index.html'), 'previous');

    const result = await createStaticGen({ registry, outputDir }).generate();

    expect(result.failed).toBe(1);
    expect(result.routes[0].error).toContain('load failed');
    expect(fs.readFileSync(path.join(outputDir, 'index.html'), 'utf8')).toBe(
      'previous'
    );
  });
});
