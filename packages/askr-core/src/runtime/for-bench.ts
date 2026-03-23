const BENCH_BUILD_ENABLED = process.env.ASKR_BENCH === '1';

type BenchGlobal = typeof globalThis & {
  __ASKR_BENCH__?: boolean;
  __ASKR_FOR_BENCH__?: BenchMetrics;
};

export interface BenchMetrics {
  itemsCreated: number;
  itemsReused: number;
  itemsRemoved: number;
  itemsMoved: number;
  rowFactoryInvocations: number;
  keyLookups: number;
  keyHits: number;
  keyMisses: number;
  domInserts: number;
  domRemoves: number;
  domMoves: number;
  domAttrSets: number;
  domTextSets: number;
  reconcilePhaseMs: number;
  domCommitPhaseMs: number;
  fastLaneName: string | null;
}

export type BenchEvent =
  | 'itemCreated'
  | 'itemReused'
  | 'itemRemoved'
  | 'itemMoved'
  | 'rowFactory'
  | 'keyLookup'
  | 'keyHit'
  | 'keyMiss'
  | 'domInsert'
  | 'domRemove'
  | 'domMove'
  | 'domAttrSet'
  | 'domTextSet';

function createInitialBenchMetrics(): BenchMetrics {
  return {
    itemsCreated: 0,
    itemsReused: 0,
    itemsRemoved: 0,
    itemsMoved: 0,
    rowFactoryInvocations: 0,
    keyLookups: 0,
    keyHits: 0,
    keyMisses: 0,
    domInserts: 0,
    domRemoves: 0,
    domMoves: 0,
    domAttrSets: 0,
    domTextSets: 0,
    reconcilePhaseMs: 0,
    domCommitPhaseMs: 0,
    fastLaneName: null,
  };
}

const emptyBenchMetrics = createInitialBenchMetrics();

function isBenchRuntimeEnabled(): boolean {
  if (!BENCH_BUILD_ENABLED) {
    return false;
  }

  try {
    return !!(globalThis as BenchGlobal).__ASKR_BENCH__;
  } catch {
    return false;
  }
}

function publishBenchMetrics(metrics: BenchMetrics): void {
  if (!isBenchRuntimeEnabled()) {
    return;
  }

  (globalThis as BenchGlobal).__ASKR_FOR_BENCH__ = { ...metrics };
}

const flushBenchMetricsLive = (): void => {
  if (!benchMetrics) {
    return;
  }

  publishBenchMetrics(benchMetrics);
};

function resetBenchMetricsLive(metrics: BenchMetrics): void {
  metrics.itemsCreated = 0;
  metrics.itemsReused = 0;
  metrics.itemsRemoved = 0;
  metrics.itemsMoved = 0;
  metrics.rowFactoryInvocations = 0;
  metrics.keyLookups = 0;
  metrics.keyHits = 0;
  metrics.keyMisses = 0;
  metrics.domInserts = 0;
  metrics.domRemoves = 0;
  metrics.domMoves = 0;
  metrics.domAttrSets = 0;
  metrics.domTextSets = 0;
  metrics.reconcilePhaseMs = 0;
  metrics.domCommitPhaseMs = 0;
  metrics.fastLaneName = null;
  publishBenchMetrics(metrics);
}

const benchMetrics = BENCH_BUILD_ENABLED ? createInitialBenchMetrics() : null;

const recordBenchEventLive = (event: BenchEvent): void => {
  if (!isBenchRuntimeEnabled() || !benchMetrics) {
    return;
  }

  switch (event) {
    case 'itemCreated':
      benchMetrics.itemsCreated++;
      break;
    case 'itemReused':
      benchMetrics.itemsReused++;
      break;
    case 'itemRemoved':
      benchMetrics.itemsRemoved++;
      break;
    case 'itemMoved':
      benchMetrics.itemsMoved++;
      break;
    case 'rowFactory':
      benchMetrics.rowFactoryInvocations++;
      break;
    case 'keyLookup':
      benchMetrics.keyLookups++;
      break;
    case 'keyHit':
      benchMetrics.keyHits++;
      break;
    case 'keyMiss':
      benchMetrics.keyMisses++;
      break;
    case 'domInsert':
      benchMetrics.domInserts++;
      break;
    case 'domRemove':
      benchMetrics.domRemoves++;
      break;
    case 'domMove':
      benchMetrics.domMoves++;
      break;
    case 'domAttrSet':
      benchMetrics.domAttrSets++;
      break;
    case 'domTextSet':
      benchMetrics.domTextSets++;
      break;
  }
};

const recordBenchFastLaneLive = (name: string): void => {
  if (!isBenchRuntimeEnabled() || !benchMetrics) {
    return;
  }

  benchMetrics.fastLaneName = name;
};

const recordBenchTimingLive = (
  phase: 'reconcile' | 'domCommit',
  ms: number
): void => {
  if (!isBenchRuntimeEnabled() || !benchMetrics) {
    return;
  }

  if (phase === 'reconcile') {
    benchMetrics.reconcilePhaseMs = ms;
  } else {
    benchMetrics.domCommitPhaseMs = ms;
  }
};

const getBenchMetricsLive = (): BenchMetrics =>
  benchMetrics ? { ...benchMetrics } : { ...emptyBenchMetrics };

export const resetBenchMetrics = BENCH_BUILD_ENABLED
  ? (): void => {
      if (!isBenchRuntimeEnabled() || !benchMetrics) {
        return;
      }

      resetBenchMetricsLive(benchMetrics);
    }
  : (): void => {};

export const recordBenchEvent = BENCH_BUILD_ENABLED
  ? recordBenchEventLive
  : (_event: BenchEvent): void => {};

export const recordBenchFastLane = BENCH_BUILD_ENABLED
  ? recordBenchFastLaneLive
  : (_name: string): void => {};

export const recordBenchTiming = BENCH_BUILD_ENABLED
  ? recordBenchTimingLive
  : (_phase: 'reconcile' | 'domCommit', _ms: number): void => {};

export const getBenchMetrics = BENCH_BUILD_ENABLED
  ? getBenchMetricsLive
  : (): BenchMetrics => ({ ...emptyBenchMetrics });

export const flushBenchMetrics = BENCH_BUILD_ENABLED
  ? flushBenchMetricsLive
  : (): void => {};

export const isBenchBuildEnabled = (): boolean => BENCH_BUILD_ENABLED;
