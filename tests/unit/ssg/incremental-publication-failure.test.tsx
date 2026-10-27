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
  return {
    ...original,
    writeFile: vi.fn(original.writeFile),
    cp: vi.fn(original.cp),
  };
});

let outputDir: string;

afterEach(() => {
  if (outputDir) fs.rmSync(outputDir, { recursive: true, force: true });
  vi.mocked(fsPromises.writeFile).mockReset();
  vi.mocked(fsPromises.cp).mockReset();
});

it('should leave no incremental manifest when asset publication fails', async () => {
  const originalFs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(fsPromises.writeFile).mockImplementation(originalFs.writeFile);
  vi.mocked(fsPromises.cp).mockImplementation(originalFs.cp);
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-asset-failure-'));
  const asset = path.join(
    outputDir,
    '..',
    `${path.basename(outputDir)}-asset.txt`
  );
  fs.writeFileSync(asset, 'asset');
  try {
    const registry = createRouteRegistry(() =>
      route('/post', () => <main>post</main>, { invalidationKeys: ['post'] })
    );
    const ssg = createStaticGen({
      registry,
      outputDir,
      assets: [{ from: asset, to: 'asset.txt' }],
    });
    await ssg.generate();
    vi.mocked(fsPromises.cp).mockRejectedValueOnce(
      new Error('asset copy failed')
    );
    await expect(
      ssg.generate({ mode: 'incremental', changedKeys: ['post'] })
    ).rejects.toThrow('asset copy failed');
    expect(
      fs.existsSync(path.join(outputDir, '.askr', 'ssg-manifest.json'))
    ).toBe(false);
    const retry = await ssg.generate({
      mode: 'incremental',
      changedKeys: ['post'],
    });
    expect(retry.mode).toBe('full');
    expect(
      fs.existsSync(path.join(outputDir, '.askr', 'ssg-manifest.json'))
    ).toBe(true);
  } finally {
    fs.rmSync(asset, { force: true });
  }
});

it('should preserve the previous site when a full build cannot copy assets', async () => {
  const originalFs =
    await vi.importActual<typeof import('node:fs/promises')>(
      'node:fs/promises'
    );
  vi.mocked(fsPromises.writeFile).mockImplementation(originalFs.writeFile);
  vi.mocked(fsPromises.cp).mockImplementation(originalFs.cp);
  outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'askr-ssg-full-asset-'));
  const asset = path.join(
    outputDir,
    '..',
    `${path.basename(outputDir)}-asset.txt`
  );
  fs.writeFileSync(asset, 'asset');
  try {
    let content = 'old';
    const registry = createRouteRegistry(() =>
      route('/post', () => <main>{content}</main>)
    );
    const ssg = createStaticGen({
      registry,
      outputDir,
      assets: [{ from: asset, to: 'asset.txt' }],
    });
    await ssg.generate();
    content = 'new';
    vi.mocked(fsPromises.cp).mockRejectedValueOnce(
      new Error('asset copy failed')
    );
    await expect(ssg.generate()).rejects.toThrow('asset copy failed');
    expect(
      fs.readFileSync(path.join(outputDir, 'post', 'index.html'), 'utf8')
    ).toContain('old');
    expect(fs.readFileSync(path.join(outputDir, 'asset.txt'), 'utf8')).toBe(
      'asset'
    );
    await ssg.generate();
    expect(
      fs.readFileSync(path.join(outputDir, 'post', 'index.html'), 'utf8')
    ).toContain('new');
  } finally {
    fs.rmSync(asset, { force: true });
  }
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
      if (String(filePath).endsWith(path.join('.askr', 'ssg-manifest.json'))) {
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
