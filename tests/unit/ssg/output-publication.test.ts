import { afterEach, expect, it } from 'vite-plus/test';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { withOutputDirectoryLock } from '../../../src/ssg/output-publication';

let temporaryDirectory: string | undefined;

afterEach(async () => {
  if (temporaryDirectory)
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  temporaryDirectory = undefined;
});

it('should serialize output directory operations through a symlink alias', async () => {
  temporaryDirectory = await fs.mkdtemp(
    path.join(os.tmpdir(), 'askr-output-lock-')
  );
  const realParent = path.join(temporaryDirectory, 'real');
  const aliasParent = path.join(temporaryDirectory, 'alias');
  await fs.mkdir(realParent);
  await fs.symlink(realParent, aliasParent, 'dir');
  const outputDirectory = path.join(realParent, 'site');
  const alias = path.join(aliasParent, 'site');

  let releaseFirst!: () => void;
  let enterFirst!: () => void;
  const firstEntered = new Promise<void>((resolve) => {
    enterFirst = resolve;
  });
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  let didEnterSecond = false;
  let active = 0;
  let maximumActive = 0;
  const run = (directory: string, entered: () => void) =>
    withOutputDirectoryLock(directory, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      entered();
      if (directory === outputDirectory) await firstGate;
      active -= 1;
    });

  const first = run(outputDirectory, enterFirst);
  await firstEntered;
  const second = run(alias, () => {
    didEnterSecond = true;
  });
  for (let index = 0; index < 5; index++) await Promise.resolve();
  const overlapped = maximumActive > 1;

  releaseFirst();
  await Promise.all([first, second]);
  expect(didEnterSecond).toBe(true);
  expect(overlapped).toBe(false);
  expect(maximumActive).toBe(1);
});
