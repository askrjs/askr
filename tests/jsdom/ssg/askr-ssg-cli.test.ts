// @vitest-environment node

import { describe, expect, it, vi } from 'vite-plus/test';
import {
  parseCliArgs,
  runCli,
  type ParsedCliArgs,
} from '../../../src/bin/askr-ssg';
import type { SSGResult } from '../../../src/ssg/types';

function makeResult(overrides: Partial<SSGResult> = {}): SSGResult {
  return {
    generatedAt: new Date(0).toISOString(),
    totalRoutes: 1,
    successful: 1,
    failed: 0,
    totalDuration: 0,
    mode: 'full',
    rebuilt: 1,
    skipped: 0,
    removed: 0,
    cacheHits: 0,
    invalidatedKeys: [],
    invalidatedRoutes: [],
    routes: [
      {
        path: '/',
        filePath: 'index.html',
        html: '<div>ok</div>',
        fileSize: 13,
        renderDuration: 0,
        resourceCount: 0,
        status: 'success',
        reason: 'full',
        written: true,
      },
    ],
    ...overrides,
  };
}

describe('askr-ssg CLI', () => {
  it('should parse repeated changed-key and changed-route flags', () => {
    const parsed = parseCliArgs([
      '--config',
      './ssg.config.ts',
      '--output',
      './dist/static',
      '--workers',
      'auto',
      '--incremental',
      '--changed-key',
      'blog/a',
      '--changed-key',
      'blog/b',
      '--changed-route',
      '/blog/a',
      '--changed-route',
      '/blog/b',
    ]);

    expect(parsed).toEqual<ParsedCliArgs>({
      configPath: './ssg.config.ts',
      outputDir: './dist/static',
      workers: 'auto',
      incremental: true,
      changedKeys: ['blog/a', 'blog/b'],
      changedRoutes: ['/blog/a', '/blog/b'],
      forceFull: false,
      help: false,
    });
  });

  it('should pass forceFull through even when incremental flags are present', async () => {
    const generate = vi.fn().mockResolvedValue(makeResult());
    const createStaticGen = vi.fn().mockReturnValue({
      generate,
      getConfig: () => null,
      getResult: () => null,
    });
    const io = { log: vi.fn(), error: vi.fn() };

    const exitCode = await runCli(
      [
        '--config',
        './ssg.config.ts',
        '--output',
        './dist/static',
        '--workers',
        '4',
        '--incremental',
        '--changed-key',
        'home',
        '--force-full',
      ],
      {
        cwd: () => process.cwd(),
        now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(10),
        existsSync: () => true,
        importConfig: async () => ({
          routes: [{ path: '/', component: () => null }],
        }),
        createStaticGen:
          createStaticGen as unknown as typeof import('../../../src/ssg').createStaticGen,
      },
      io
    );

    expect(exitCode).toBe(0);
    expect(createStaticGen).toHaveBeenCalledWith(
      expect.objectContaining({
        parallelism: 4,
      })
    );
    expect(generate).toHaveBeenCalledWith({
      mode: 'incremental',
      changedKeys: ['home'],
      changedRoutes: [],
      forceFull: true,
    });
  });

  it('should return a non-zero exit code when rebuilt routes fail', async () => {
    const generate = vi.fn().mockResolvedValue(
      makeResult({
        successful: 0,
        failed: 1,
        rebuilt: 1,
        mode: 'incremental',
        routes: [
          {
            path: '/broken',
            filePath: 'broken/index.html',
            html: '',
            fileSize: 0,
            renderDuration: 1,
            resourceCount: 0,
            status: 'error',
            reason: 'changed-key',
            written: false,
            error: 'boom',
          },
        ],
      })
    );
    const createStaticGen = vi.fn().mockReturnValue({
      generate,
      getConfig: () => null,
      getResult: () => null,
    });
    const io = { log: vi.fn(), error: vi.fn() };

    const exitCode = await runCli(
      [
        '--config',
        './ssg.config.ts',
        '--output',
        './dist/static',
        '--workers',
        '2',
        '--incremental',
        '--changed-key',
        'broken',
      ],
      {
        cwd: () => process.cwd(),
        now: vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(10),
        existsSync: () => true,
        importConfig: async () => ({
          routes: [{ path: '/broken', component: () => null }],
        }),
        createStaticGen:
          createStaticGen as unknown as typeof import('../../../src/ssg').createStaticGen,
      },
      io
    );

    expect(exitCode).toBe(1);
    expect(io.log).toHaveBeenCalledWith('Errors encountered:');
    expect(io.log).toHaveBeenCalledWith('   /broken: boom');
  });
});
