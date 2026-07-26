import fs from 'node:fs';
import { bench, describe, expect } from 'vite-plus/test';
import { createStaticGen } from '../../src/ssg/create-static-gen';
import { createRouteRegistry, route } from '../../src/router';
import { buildStaticBatchRoutes, tier2BenchOptions } from '../shared/_shared';
import { createBenchTempDir, removeBenchTempDir } from '../shared/node';

const staticRoutes = buildStaticBatchRoutes(64);
const registry = createRouteRegistry(() => {
  for (const entry of staticRoutes) {
    route(entry.path, entry.handler, {
      entries: entry.entries,
    });
  }
});

await (async () => {
  const tempDir = await createBenchTempDir('askr-bench-ssg-preflight');
  const ssg = createStaticGen({
    registry,
    outputDir: tempDir.dir,
    concurrency: 8,
  });

  try {
    const result = await ssg.generate();
    expect(result.successful).toBe(64);
    expect(result.failed).toBe(0);
    expect(fs.existsSync(tempDir.metadataPath)).toBe(true);
  } finally {
    await removeBenchTempDir(tempDir.dir);
  }
})();

describe('tier2 ssr static batch', () => {
  let tempDir: Awaited<ReturnType<typeof createBenchTempDir>> | null = null;
  let ssg: ReturnType<typeof createStaticGen> | null = null;

  bench(
    'generate 64 static routes with metadata',
    async () => {
      await ssg!.generate();
    },
    {
      ...tier2BenchOptions,
      async setup() {
        tempDir = await createBenchTempDir('askr-bench-ssg');
        ssg = createStaticGen({
          registry,
          outputDir: tempDir.dir,
          concurrency: 8,
        });
      },
      async teardown() {
        if (tempDir) {
          await removeBenchTempDir(tempDir.dir);
        }
        tempDir = null;
        ssg = null;
      },
    }
  );
});
