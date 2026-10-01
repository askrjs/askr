import { afterEach, describe, expect, it } from 'vite-plus/test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createRouteRegistry, route } from '../../../src/router/route';
import { createStaticGen } from '../../../src/ssg';

describe('incremental SSG output presence', () => {
  let outputDir: string | undefined;

  afterEach(async () => {
    if (outputDir) await fs.rm(outputDir, { recursive: true, force: true });
  });

  it('should regenerate an unchanged route whose published HTML disappeared', async () => {
    outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'askr-missing-output-')
    );
    const renders: string[] = [];
    const registry = createRouteRegistry(() => {
      route(
        '/reports/{name}',
        ({ name }) => {
          renders.push(name);
          return <main>{name}</main>;
        },
        {
          entries: () => [{ name: 'missing' }, { name: 'retained' }],
          invalidationKeys: ['reports'],
        }
      );
    });
    const ssg = createStaticGen({ registry, outputDir });
    await ssg.generate();
    renders.length = 0;
    const missingFile = path.join(
      outputDir,
      'reports',
      'missing',
      'index.html'
    );
    await fs.unlink(missingFile);

    const result = await ssg.generate({ mode: 'incremental' });

    expect(result.mode).toBe('incremental');
    expect(result.failed).toBe(0);
    expect(result.rebuilt).toBe(1);
    expect(result.skipped).toBe(1);
    expect(renders).toEqual(['missing']);
    expect(result.routes[0]).toMatchObject({
      path: '/reports/missing',
      status: 'success',
      reason: 'new-route',
      written: true,
    });
    expect(result.routes[1]).toMatchObject({
      path: '/reports/retained',
      status: 'skipped',
      reason: 'unchanged',
      written: false,
    });
    expect(await fs.readFile(missingFile, 'utf8')).toBe('<main>missing</main>');
  });
});
