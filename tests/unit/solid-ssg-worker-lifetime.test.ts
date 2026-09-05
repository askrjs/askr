import { afterEach, expect, test, vi } from 'vite-plus/test';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createStaticGen } from '../../src/ssg';
import { createRouteRegistry, route } from '../../src/router/route';
import { writeStaticFiles } from '../../src/ssg/write-static-files';
import type { RouteRenderResult } from '../../src/ssg/types';
import { withOutputDirectoryLock } from '../../src/ssg/output-publication';

vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...original,
    mkdir: vi.fn(original.mkdir),
    mkdtemp: vi.fn(original.mkdtemp),
    writeFile: vi.fn(original.writeFile),
    rename: vi.fn(original.rename),
    rm: vi.fn(original.rm),
  };
});

afterEach(() => {
  vi.resetAllMocks();
});

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

test('should drain preparation failures from live results before cleanup and releasing the output lock', async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  const outputDir = path.resolve('/tmp/askr-solid-live-result-virtual');
  const events: string[] = [];
  const cleanupFailure = new Error('cleanup failed');
  const ssg = createStaticGen({
    registry: createRouteRegistry(() => {
      for (const name of ['first', 'invalid', 'never', 'last']) {
        route(`/${name}`, () => null);
      }
    }),
    outputDir,
    concurrency: 3,
  });

  vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  vi.mocked(fs.mkdtemp).mockResolvedValue(`${outputDir}-staging`);
  vi.mocked(fs.writeFile).mockImplementation(async (file) => {
    const name = path.basename(path.dirname(String(file)));
    events.push(`write ${name}`);
    if (name === 'first') {
      // getResult exposes the current generation's mutable route records.
      ssg.getResult()!.routes[1].filePath = '../escaped.html';
      started();
    }
    await blocked;
  });
  vi.mocked(fs.rename).mockImplementation(async (_from, to) => {
    events.push(`publish ${path.basename(path.dirname(String(to)))}`);
  });
  vi.mocked(fs.rm).mockImplementation(async (_file, options) => {
    events.push(options?.recursive ? 'staging cleanup' : 'temp cleanup');
    throw cleanupFailure;
  });

  let rejected = false;
  const observed = ssg.generate().catch((error: unknown) => {
    rejected = true;
    return error;
  });
  await firstStarted;
  const next = withOutputDirectoryLock(outputDir, async () => {
    events.push('next generation');
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  const beforeRelease = { rejected, events: events.slice() };
  release();
  const failure = await observed;
  await next;
  // A broken fail-fast worker can still be draining after generate rejects.
  await new Promise<void>((resolve) => setImmediate(resolve));

  expect(beforeRelease).toEqual({ rejected: false, events: ['write first'] });
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toBe(
    'SSG output path must stay inside outputDir: ../escaped.html'
  );
  expect(events).toEqual([
    'write first',
    'publish first',
    'temp cleanup',
    'staging cleanup',
    'next generation',
  ]);
});
