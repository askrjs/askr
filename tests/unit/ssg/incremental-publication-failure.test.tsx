import { afterEach, expect, it, vi } from 'vite-plus/test';
import * as fs from 'node:fs';
import * as fsPromises from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { createStaticGen } from '../../../src/ssg';
import { createRouteRegistry, route } from '../../../src/router/route';
import { hashHtml } from '../../../src/ssg/incremental-manifest';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return { ...original, writeFile: vi.fn(original.writeFile) };
});

let outputDir: string;

afterEach(() => {
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  vi.mocked(fsPromises.writeFile).mockReset();
});

it('should rebuild routes after incremental manifest publication fails', async () => {
  const originalFs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(fsPromises.writeFile).mockImplementation(originalFs.writeFile);
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-manifest-'));

  let content = 'version A';
  const registry = createRouteRegistry(() => {
    route('/post', () => <main>{content}</main>, {
      invalidationKeys: ['post'],
    });
  });
  const ssg = createStaticGen({ registry, outputDir });
  await ssg.generate();

  content = 'version B';
  vi.mocked(fsPromises.writeFile).mockImplementation(
    (filePath, data, options) => {
      if (String(filePath).endsWith('.askr/ssg-manifest.json')) {
        return Promise.reject(new Error('manifest write failed'));
      }
      return originalFs.writeFile(filePath, data, options);
    }
  );

  await expect(
    ssg.generate({ mode: 'incremental', changedKeys: ['post'] })
  ).rejects.toThrow('manifest write failed');
  vi.mocked(fsPromises.writeFile).mockImplementation(originalFs.writeFile);

  content = 'version A';
  await ssg.generate({ mode: 'incremental', changedKeys: ['post'] });

  expect(
    fs.readFileSync(path.join(outputDir, 'post', 'index.html'), 'utf8')
  ).toContain('version A');
});

it('should publish changed HTML even when its hash matches the previous manifest', async () => {
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-collision-'));
  const originalFs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(fsPromises.writeFile).mockImplementation(originalFs.writeFile);
  let content = 'value-162789';
  const registry = createRouteRegistry(() => {
    route('/post', () => <main>{content}</main>, {
      invalidationKeys: ['post'],
    });
  });
  const ssg = createStaticGen({ registry, outputDir });
  await ssg.generate();

  const htmlPath = path.join(outputDir, 'post', 'index.html');
  const before = fs.readFileSync(htmlPath, 'utf8');
  const after = '<main>value-379192</main>';
  expect(hashHtml(before)).toBe(hashHtml(after));
  content = 'value-379192';

  await ssg.generate({ mode: 'incremental', changedKeys: ['post'] });
  expect(fs.readFileSync(htmlPath, 'utf8')).toBe(after);
});
