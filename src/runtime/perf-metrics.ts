type PerfMetrics = {
  selectorInvalidations: number;
  selectorCandidateReads: number;
  reactivePropReevaluations: number;
  skippedDomPropWrites: number;
  classListPatchOps: number;
  delegatedAncestorHops: number;
  hydrationBoundaryActivations: number;
  ssrTagCacheHits: number;
  lastSchedulerTaskCountPerFlush: number;
  maxSchedulerTaskCountPerFlush: number;
  schedulerFlushCount: number;
  schedulerTaskExecutions: number;
  ssgWorkerCount: number;
  ssgRenderTimeMs: number;
  ssgWorkerRenderTimeMs: number;
  ssgWriteTimeMs: number;
};

type PerfMetricsKey = keyof PerfMetrics;

type AskrPerfGlobal = typeof globalThis & {
  __ASKR_BENCH__?: boolean;
  __ASKR_PERF__?: PerfMetrics;
};

function createInitialPerfMetrics(): PerfMetrics {
  return {
    selectorInvalidations: 0,
    selectorCandidateReads: 0,
    reactivePropReevaluations: 0,
    skippedDomPropWrites: 0,
    classListPatchOps: 0,
    delegatedAncestorHops: 0,
    hydrationBoundaryActivations: 0,
    ssrTagCacheHits: 0,
    lastSchedulerTaskCountPerFlush: 0,
    maxSchedulerTaskCountPerFlush: 0,
    schedulerFlushCount: 0,
    schedulerTaskExecutions: 0,
    ssgWorkerCount: 0,
    ssgRenderTimeMs: 0,
    ssgWorkerRenderTimeMs: 0,
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
  key:
    | 'selectorInvalidations'
    | 'selectorCandidateReads'
    | 'reactivePropReevaluations'
    | 'skippedDomPropWrites'
    | 'classListPatchOps'
    | 'delegatedAncestorHops'
    | 'hydrationBoundaryActivations'
    | 'ssrTagCacheHits'
    | 'ssgWorkerCount',
  delta = 1
): void {
  const store = getPerfStore();
  if (!store) return;
  store[key] += delta;
}

export function addPerfDuration(
  key: 'ssgRenderTimeMs' | 'ssgWorkerRenderTimeMs' | 'ssgWriteTimeMs',
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
