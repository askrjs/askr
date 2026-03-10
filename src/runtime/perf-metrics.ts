type PerfMetrics = {
  reactivePropReevaluations: number;
  skippedDomPropWrites: number;
  delegatedAncestorHops: number;
  lastSchedulerTaskCountPerFlush: number;
  maxSchedulerTaskCountPerFlush: number;
  schedulerFlushCount: number;
  schedulerTaskExecutions: number;
  ssgRenderTimeMs: number;
  ssgWriteTimeMs: number;
};

type PerfMetricsKey = keyof PerfMetrics;

type AskrPerfGlobal = typeof globalThis & {
  __ASKR_BENCH__?: boolean;
  __ASKR_PERF__?: PerfMetrics;
};

function createInitialPerfMetrics(): PerfMetrics {
  return {
    reactivePropReevaluations: 0,
    skippedDomPropWrites: 0,
    delegatedAncestorHops: 0,
    lastSchedulerTaskCountPerFlush: 0,
    maxSchedulerTaskCountPerFlush: 0,
    schedulerFlushCount: 0,
    schedulerTaskExecutions: 0,
    ssgRenderTimeMs: 0,
    ssgWriteTimeMs: 0,
  };
}

function shouldCollectPerfMetrics(): boolean {
  if (process.env.NODE_ENV !== 'production') {
    return true;
  }
  try {
    return !!(globalThis as AskrPerfGlobal).__ASKR_BENCH__;
  } catch {
    return false;
  }
}

function getPerfStore(): PerfMetrics | null {
  if (!shouldCollectPerfMetrics()) {
    return null;
  }

  try {
    const g = globalThis as AskrPerfGlobal;
    if (!g.__ASKR_PERF__) {
      g.__ASKR_PERF__ = createInitialPerfMetrics();
    }
    return g.__ASKR_PERF__;
  } catch {
    return null;
  }
}

export function incrementPerfMetric(
  key: 'reactivePropReevaluations' | 'skippedDomPropWrites' | 'delegatedAncestorHops',
  delta = 1
): void {
  const store = getPerfStore();
  if (!store) return;
  store[key] += delta;
}

export function addPerfDuration(
  key: 'ssgRenderTimeMs' | 'ssgWriteTimeMs',
  deltaMs: number
): void {
  const store = getPerfStore();
  if (!store) return;
  store[key] += deltaMs;
}

export function recordSchedulerFlushTaskCount(taskCount: number): void {
  const store = getPerfStore();
  if (!store) return;
  store.lastSchedulerTaskCountPerFlush = taskCount;
  store.maxSchedulerTaskCountPerFlush = Math.max(
    store.maxSchedulerTaskCountPerFlush,
    taskCount
  );
  store.schedulerFlushCount += 1;
  store.schedulerTaskExecutions += taskCount;
}

export function getPerfMetrics(): Readonly<PerfMetrics> | undefined {
  const store = getPerfStore();
  return store ? { ...store } : undefined;
}

export function resetPerfMetrics(): void {
  const store = getPerfStore();
  if (!store) return;
  const next = createInitialPerfMetrics();
  (Object.keys(next) as PerfMetricsKey[]).forEach((key) => {
    store[key] = next[key];
  });
}

