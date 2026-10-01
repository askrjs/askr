import { afterEach, describe, expect, it } from 'vite-plus/test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createStaticGen } from '../../../src/ssg';
import { createRouteRegistry, route } from '../../../src/router';

describe('SSG legacy route entry spelling', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await fs.rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it.each([
    {
      template: '/docs/{*path}',
      key: '*path',
      name: 'path',
      value: 'guide/start',
      output: 'docs/guide/start/index.html',
    },
    {
      template: '/posts/{ slug }',
      key: ' slug ',
      name: 'slug',
      value: 'a#b',
      output: 'posts/a#b/index.html',
    },
    ...['constructor', 'toString', '__proto__'].map((name) => ({
      template: `/docs/{*${name}}`,
      key: `*${name}`,
      name,
      value: 'guide/start',
      output: 'docs/guide/start/index.html',
    })),
  ])(
    'should generate previously accepted raw entry key $key for widened template $template',
    async ({ template, key, name, value, output }) => {
      directory = await fs.mkdtemp(
        path.join(os.tmpdir(), 'askr-legacy-entry-')
      );
      const seen: string[] = [];
      const registry = createRouteRegistry(() => {
        route(
          template,
          (params) => {
            const current = (params as Record<string, string>)[name];
            seen.push(current);
            return <main>{current}</main>;
          },
          { entries: () => [{ [key]: value }] }
        );
      });

      const result = await createStaticGen({
        registry,
        outputDir: directory,
      }).generate();

      expect(result.failed).toBe(0);
      expect(result.routes[0].path).toBe(
        '/' + output.slice(0, -'/index.html'.length)
      );
      expect(result.routes[0].filePath).toBe(output);
      expect(seen).toEqual([value]);
      expect(await fs.readFile(path.join(directory, output), 'utf8')).toContain(
        `<main>${value}</main>`
      );
    }
  );
});
