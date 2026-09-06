declare const __ASKR_BENCH_BUILD__: boolean;
declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

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

// Resolve build mode once. The hot-path counters below must not rebuild the
// runtime environment on every increment.
const BENCH_BUILD_ENABLED = __ASKR_BENCH_BUILD__;
const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;
const PERF_BUILD_ENABLED = DEVELOPMENT_BUILD_ENABLED || BENCH_BUILD_ENABLED;
let cachedPerfStore: PerfMetrics | undefined;

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
  if (DEVELOPMENT_BUILD_ENABLED) {
    return true;
  }
  if (!BENCH_BUILD_ENABLED) {
    return false;
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

  if (cachedPerfStore) {
    return cachedPerfStore;
  }

  try {
    const g = globalThis as AskrPerfGlobal;
    if (!g.__ASKR_PERF__) {
      g.__ASKR_PERF__ = createInitialPerfMetrics();
    }
    cachedPerfStore = g.__ASKR_PERF__;
    return cachedPerfStore;
  } catch {
    return null;
  }
}

function getPerfMetricsStoreLive(): PerfMetrics | null {
  return getPerfStore();
}

type IncrementPerfMetric = (
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
  delta?: number
) => void;

const incrementPerfMetricLive: IncrementPerfMetric = (key, delta = 1) => {
  const store = getPerfStore();
  if (!store) return;
  store[key] += delta;
};

type AddPerfDuration = (
  key: 'ssgRenderTimeMs' | 'ssgWorkerRenderTimeMs' | 'ssgWriteTimeMs',
  deltaMs: number
) => void;

const addPerfDurationLive: AddPerfDuration = (key, deltaMs) => {
  const store = getPerfStore();
  if (!store) return;
  store[key] += deltaMs;
};

function recordSchedulerFlushTaskCountLive(taskCount: number): void {
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

function getPerfMetricsLive(): Readonly<PerfMetrics> | undefined {
  const store = getPerfStore();
  return store ? { ...store } : undefined;
}

function resetPerfMetricsLive(): void {
  const store = getPerfStore();
  if (!store) return;
  const next = createInitialPerfMetrics();
  (Object.keys(next) as PerfMetricsKey[]).forEach((key) => {
    store[key] = next[key];
  });
}

export const getPerfMetricsStore: () => PerfMetrics | null = PERF_BUILD_ENABLED
  ? getPerfMetricsStoreLive
  : () => null;

export const incrementPerfMetric: IncrementPerfMetric = PERF_BUILD_ENABLED
  ? incrementPerfMetricLive
  : () => {};

export const addPerfDuration: AddPerfDuration = PERF_BUILD_ENABLED
  ? addPerfDurationLive
  : () => {};

export const recordSchedulerFlushTaskCount: (taskCount: number) => void =
  PERF_BUILD_ENABLED ? recordSchedulerFlushTaskCountLive : () => {};

export const getPerfMetrics: () => Readonly<PerfMetrics> | undefined =
  PERF_BUILD_ENABLED ? getPerfMetricsLive : () => undefined;

export const resetPerfMetrics: () => void = PERF_BUILD_ENABLED
  ? resetPerfMetricsLive
  : () => {};
