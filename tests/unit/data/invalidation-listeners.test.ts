import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

// Observe the listener dispatch that production invalidations used to run
// unconditionally.
vi.mock('../../../src/data/invalidation-listeners', async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import('../../../src/data/invalidation-listeners')
    >();
  return { ...actual, emitInvalidation: vi.fn(actual.emitInvalidation) };
});

const { emitInvalidation } =
  await import('../../../src/data/invalidation-listeners');
const { createDataRuntime, invalidate } = await import('../../../src/data');
const { createInvalidationRecorder } =
  await import('../../../src/testing/invalidation');

describe('invalidation listeners', () => {
  afterEach(() => {
    vi.mocked(emitInvalidation).mockClear();
  });

  it('should skip listener dispatch when no test listener is registered', () => {
    const runtime = createDataRuntime();

    invalidate('users:', { runtime });
    invalidate('teams:', { runtime, markPendingWrite: true });

    expect(emitInvalidation).not.toHaveBeenCalled();
  });

  it('should dispatch to a registered recorder and stop after it stops', () => {
    const runtime = createDataRuntime();
    const recorder = createInvalidationRecorder();

    invalidate('users:', { runtime });
    recorder.stop();
    invalidate('teams:', { runtime });

    expect(recorder.prefixes).toEqual(['users:']);
    expect(emitInvalidation).toHaveBeenCalledTimes(1);
  });
});
