import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vite-plus/test';
import {
  createRouteRegistry,
  group,
  layoutData,
  route,
} from '../../../src/router';
import { createStaticGen } from '../../../src/ssg';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('SSG with group loaders', () => {
  it('should report routes under a group loader as runtime-only instead of failing', async () => {
    const loader = async () => ({ nav: ['a'] });
    const registry = createRouteRegistry(() => {
      route('/', () => <p>home</p>);
      group(
        {
          loader,
          layout: ({ children }: { children?: unknown }) => (
            <div>
              {`${layoutData(loader).nav.length}`}
              {children as never}
            </div>
          ),
        },
        () => {
          route('/docs', () => <p>docs</p>);
        }
      );
    });
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-group-'));
    directories.push(root);
    const outputDir = path.join(root, 'dist');
    const result = await createStaticGen({ registry, outputDir }).generate();
    const docs = result.routes.find((entry) => entry.path === '/docs');
    expect(docs?.status).toBe('skipped');
    expect(docs?.reason).toBe('runtime-only');
    expect(fs.existsSync(path.join(outputDir, 'index.html'))).toBe(true);
  });
});
