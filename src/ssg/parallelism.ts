import * as os from 'node:os';

export function resolveParallelism(
  requested: number | 'auto' | undefined
): number {
  if (requested !== 'auto') {
    return Math.max(1, requested ?? 1);
  }

  const maybeNavigator = globalThis as typeof globalThis & {
    navigator?: { hardwareConcurrency?: number };
    process?: { env?: Record<string, string | undefined> };
  };

  const envWorkers = Number(
    maybeNavigator.process?.env?.ASKR_SSG_WORKERS ??
      maybeNavigator.process?.env?.NUMBER_OF_PROCESSORS ??
      maybeNavigator.process?.env?.UV_THREADPOOL_SIZE
  );
  if (Number.isFinite(envWorkers) && envWorkers > 0) {
    return Math.max(1, Math.trunc(envWorkers));
  }

  if (typeof maybeNavigator.navigator?.hardwareConcurrency === 'number') {
    return Math.max(1, maybeNavigator.navigator.hardwareConcurrency);
  }

  // Retain the CPU-count fallback for environments that do not expose
  // availableParallelism().
  const availableParallelism = (
    os as typeof os & {
      availableParallelism?: () => number;
    }
  ).availableParallelism;
  return Math.max(1, availableParallelism?.() ?? os.cpus().length ?? 1);
}
