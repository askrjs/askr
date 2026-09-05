import { expect, test } from 'vite-plus/test';
import { writeStaticFiles } from '../../src/ssg/write-static-files';
import type { RouteRenderResult } from '../../src/ssg/types';
import { withOutputDirectoryLock } from '../../src/ssg/output-publication';

test('should a failed write batch does not publish sibling output after rejecting', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let finished!: () => void;
  const siblingFinished = new Promise<void>((resolve) => {
    finished = resolve;
  });
  let rejected = false;
  let latePublish = false;
  const results: RouteRenderResult[] = ['first', 'second'].map((name) => ({
    path: `/${name}`,
    filePath: `${name}/index.html`,
    html: name,
    fileSize: name.length,
    renderDuration: 0,
    resourceCount: 0,
    status: 'success',
    reason: 'full',
    written: true,
  }));
  const writing = writeStaticFiles(
    results,
    '/tmp/askr-solid-audit-virtual',
    { concurrency: 2 },
    {
      mkdir: async () => undefined,
      readdir: async () => [],
      rmdir: async () => undefined,
      rm: async (file) => {
        if (String(file).includes('second')) finished();
      },
      writeFile: async (_path, data) => {
        if (data === 'first') throw new Error('write failed');
        await blocked;
      },
      rename: async () => {
        latePublish = rejected;
      },
    }
  );
  const observed = writing.catch(() => {
    rejected = true;
  });
  // Release the sibling in a later turn, after a fail-fast batch can reject.
  await new Promise<void>((resolve) => setImmediate(resolve));
  release();
  await observed;
  await siblingFinished;
  expect(latePublish).toBe(false);
});

test('should retain the output lock through draining and preserve the first error over cleanup', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const failure = new Error('first write');
  const events: string[] = [];
  const results: RouteRenderResult[] = ['first', 'second', 'never'].map(
    (name) => ({
      path: `/${name}`,
      filePath: `${name}/index.html`,
      html: name,
      fileSize: name.length,
      renderDuration: 0,
      resourceCount: 0,
      status: 'success',
      reason: 'full',
      written: true,
    })
  );
  const first = withOutputDirectoryLock(
    '/tmp/askr-solid-lock-virtual',
    async () => {
      try {
        await writeStaticFiles(
          results,
          '/tmp/askr-solid-lock-virtual',
          { concurrency: 2 },
          {
            mkdir: async () => undefined,
            readdir: async () => [],
            rmdir: async () => undefined,
            writeFile: async (_path, data) => {
              events.push(String(data));
              if (data === 'first') throw failure;
              await blocked;
            },
            rename: async () => {
              events.push('publish');
            },
            rm: async () => {
              throw new Error('cleanup');
            },
          }
        );
      } finally {
        events.push('staging cleanup');
      }
    }
  );
  const observed = first.catch((error: unknown) => error);
  const second = withOutputDirectoryLock(
    '/tmp/askr-solid-lock-virtual',
    async () => {
      events.push('next generation');
    }
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(events).toEqual(['first', 'second']);
  release();
  expect(await observed).toBe(failure);
  await second;
  expect(events).toEqual([
    'first',
    'second',
    'publish',
    'staging cleanup',
    'next generation',
  ]);
});
