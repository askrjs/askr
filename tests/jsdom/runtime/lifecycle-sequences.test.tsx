import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vite-plus/test';
import { cleanupApp, createSPA, hydrateSPA } from '../../../src/boot';
import { Case, For, Match, Show } from '../../../src/control';
import { navigate } from '../../../src/router/navigate';
import { createRouteRegistry, route } from '../../../src/router/route';
import { resource, task } from '../../../src/runtime/operations';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime';
import { enqueueRuntimeLane } from '../../../src/runtime/access';
import { state, type State } from '../../../src/runtime/state';
import { Portal, _resetDefaultPortal } from '../../../src/runtime/portal';
import { renderToStringSync } from '../../../src/ssr';
import {
  createTestContainer,
  flushScheduler,
  getSchedulerState,
} from '../../../test-utils/render/test-renderer';

type Deferred<T> = {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
};

type Row = { id: number; label: string };

type QualityOperation =
  | 'mount-update-dispose'
  | 'show-case-failure-retry'
  | 'keyed-reorder'
  | 'navigation-cancel'
  | 'popstate'
  | 'resource-resolve'
  | 'resource-reject'
  | 'resource-abort'
  | 'portal-teardown'
  | 'cleanup-failure'
  | 'renderer-rollback'
  | 'scheduler-failure-reschedule';

type QualityModel = {
  rows: number[];
  show: boolean;
  mode: 'a' | 'b';
  mounted: boolean;
  portal: boolean;
  route: string;
};

type QualityTrace = {
  bootMode: 'client' | 'hydration';
  seed: number;
  environment: {
    node: string;
    platform: string;
    userAgent: string;
  };
  operations: QualityOperation[];
  executedOperations: QualityOperation[];
  minimizedReplay: QualityOperation[];
  expected: QualityModel;
  observed: ReturnType<typeof observeQualityState>;
  error: { name: string; message: string; stack?: string };
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value;
  };
}

const DEFAULT_QUALITY_SEEDS = [1, 7, 42, 0xc0ffee];

function parseSeed(value: string): number {
  const seed = Number(value.trim());
  if (!Number.isInteger(seed) || seed < 0) {
    throw new Error(`Invalid lifecycle quality seed: ${value}`);
  }
  return seed;
}

export function resolveLifecycleQualitySeeds(
  specification = process.env.ASKR_QUALITY_SEEDS
): number[] {
  if (!specification) {
    return DEFAULT_QUALITY_SEEDS;
  }

  const seeds = new Set<number>();
  for (const entry of specification.split(',')) {
    const range = entry.trim().split('..');
    if (range.length === 1) {
      seeds.add(parseSeed(range[0]!));
      continue;
    }
    if (range.length !== 2) {
      throw new Error(`Invalid lifecycle quality seed range: ${entry}`);
    }

    const start = parseSeed(range[0]!);
    const end = parseSeed(range[1]!);
    if (end < start || end - start > 10_000) {
      throw new Error(`Invalid lifecycle quality seed range: ${entry}`);
    }
    for (let seed = start; seed <= end; seed += 1) {
      seeds.add(seed);
    }
  }

  return [...seeds];
}

const REQUIRED_TRACE_OPERATIONS: QualityOperation[] = [
  'mount-update-dispose',
  'show-case-failure-retry',
  'keyed-reorder',
  'navigation-cancel',
  'popstate',
  'resource-resolve',
  'resource-reject',
  'resource-abort',
  'portal-teardown',
  'cleanup-failure',
  'renderer-rollback',
  'scheduler-failure-reschedule',
];

const RANDOM_TRACE_OPERATIONS: QualityOperation[] = [
  'show-case-failure-retry',
  'keyed-reorder',
  'resource-resolve',
  'resource-reject',
  'resource-abort',
  'portal-teardown',
  'mount-update-dispose',
  'scheduler-failure-reschedule',
];

function createTrace(seed: number): QualityOperation[] {
  const next = seeded(seed);
  const operations = [...REQUIRED_TRACE_OPERATIONS];
  const randomOperationCount = 28;
  for (let index = 0; index < randomOperationCount; index += 1) {
    operations.push(
      RANDOM_TRACE_OPERATIONS[next() % RANDOM_TRACE_OPERATIONS.length]!
    );
  }
  return operations;
}

function errorDetails(error: unknown): QualityTrace['error'] {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }
  return { name: 'UnknownError', message: String(error) };
}

function observeQualityState(
  container: HTMLElement,
  navigationContainer: HTMLElement
) {
  return {
    text: container.textContent ?? '',
    rows: Array.from(
      container.querySelectorAll<HTMLElement>('[data-quality-row]'),
      (node) => Number(node.dataset.qualityRow)
    ),
    showBranch:
      container.querySelector('[data-quality-show]')?.textContent ?? null,
    caseBranch:
      container.querySelector('[data-quality-case]')?.textContent ?? null,
    tracked: container.querySelector('[data-quality-tracked]') !== null,
    portal: container.querySelector('[data-quality-portal]') !== null,
    resource:
      container.querySelector('[data-quality-resource]')?.textContent ?? null,
    route: navigationContainer.textContent ?? '',
    scheduler: getSchedulerState(),
  };
}

function writeQualityTrace(
  bootMode: QualityTrace['bootMode'],
  seed: number,
  operations: QualityOperation[],
  executedOperations: QualityOperation[],
  expected: QualityModel,
  observed: ReturnType<typeof observeQualityState>,
  error: unknown
): void {
  const traceDirectory = path.resolve(process.cwd(), '.askr-quality-traces');
  fs.mkdirSync(traceDirectory, { recursive: true });
  const trace: QualityTrace = {
    bootMode,
    seed,
    environment: {
      node: process.version,
      platform: process.platform,
      userAgent:
        typeof navigator === 'undefined' ? 'node' : navigator.userAgent,
    },
    operations,
    executedOperations,
    // The first failing prefix is a deterministic minimized replay: later
    // operations have not run and therefore cannot contribute to this failure.
    minimizedReplay: executedOperations,
    expected,
    observed,
    error: errorDetails(error),
  };
  fs.writeFileSync(
    path.join(traceDirectory, `${bootMode}-seed-${seed}-${Date.now()}.json`),
    `${JSON.stringify(trace, null, 2)}\n`
  );
}

function expectSchedulerQuiescent(): void {
  const scheduler = getSchedulerState();
  expect(scheduler.running).toBe(false);
  expect(scheduler.taskCount).toBe(0);
}

describe('lifecycle sequence invariants', () => {
  const traceCases = resolveLifecycleQualitySeeds().flatMap((seed) =>
    (['client', 'hydration'] as const).map((bootMode) => ({
      seed,
      bootMode,
    }))
  );

  it.each(traceCases)(
    'replays lifecycle sequence trace for $bootMode seed $seed',
    async ({ seed, bootMode }) => {
      _resetDefaultPortal();

      const { container, cleanup } = createTestContainer();
      const navigation = createTestContainer();
      const resourceDeferreds = new Map<number, Deferred<string>>();
      const guard = createDeferred<{ kind: 'allow' }>();
      let rows!: State<Row[]>;
      let show!: State<boolean>;
      let mode!: State<'a' | 'b'>;
      let mounted!: State<boolean>;
      let portalVisible!: State<boolean>;
      let resourceEpoch!: State<number>;
      let branchFailure!: State<boolean>;
      let latestSignal: AbortSignal | null = null;
      let trackedCleanupCount = 0;

      function getResourceDeferred(epoch: number): Deferred<string> {
        let deferred = resourceDeferreds.get(epoch);
        if (!deferred) {
          deferred = createDeferred<string>();
          resourceDeferreds.set(epoch, deferred);
        }
        return deferred;
      }

      function BrokenBranch(): null {
        throw new Error('quality branch failure');
      }

      function TrackedChild() {
        task(() => () => {
          trackedCleanupCount += 1;
        });
        return <span data-quality-tracked={'true'}>{'tracked'}</span>;
      }

      function QualityApp() {
        rows = state<Row[]>([
          { id: 1, label: 'one' },
          { id: 2, label: 'two' },
          { id: 3, label: 'three' },
        ]);
        show = state(true);
        mode = state<'a' | 'b'>('a');
        mounted = state(true);
        portalVisible = state(true);
        resourceEpoch = state(0);
        branchFailure = state(false);

        const currentResource =
          bootMode === 'hydration'
            ? ({ value: 'hydrated', error: null } as const)
            : resource<string>(
                ({ signal }) => {
                  latestSignal = signal;
                  return getResourceDeferred(resourceEpoch()).promise;
                },
                [resourceEpoch()]
              );

        return (
          <main>
            <section data-quality-show-host>
              <Show
                when={show()}
                fallback={<p data-quality-show={'fallback'}>{'hidden'}</p>}
              >
                {() =>
                  branchFailure() ? (
                    <BrokenBranch />
                  ) : (
                    <>
                      <p data-quality-show={'start'}>{'shown'}</p>
                      <p data-quality-show={'end'}>{'branch'}</p>
                    </>
                  )
                }
              </Show>
            </section>
            <section data-quality-case-host>
              <Case
                fallback={
                  <p data-quality-case={'fallback'}>{'case-fallback'}</p>
                }
              >
                <Match when={mode() === 'a'} key={'a'}>
                  {() => (
                    <>
                      <span data-quality-case={'a-start'}>{'case-a'}</span>
                      <span data-quality-case={'a-end'}>{'ready'}</span>
                    </>
                  )}
                </Match>
                <Match when={mode() === 'b'} key={'b'}>
                  {() => <span data-quality-case={'b'}>{'case-b'}</span>}
                </Match>
              </Case>
            </section>
            <section data-quality-for-host>
              <For each={rows} by={(row) => row.id}>
                {(row) => (
                  <>
                    <span data-quality-row={String(row.id)}>{row.label}</span>
                    <em>{'!'}</em>
                  </>
                )}
              </For>
            </section>
            <section data-quality-mounted-host>
              <Show when={mounted()} fallback={<span>{'unmounted'}</span>}>
                {() => <TrackedChild />}
              </Show>
            </section>
            <section data-quality-portal-host>
              <Portal>
                {portalVisible() ? (
                  <aside data-quality-portal={'true'}>{'portal'}</aside>
                ) : null}
              </Portal>
            </section>
            <output data-quality-resource>
              {currentResource.error
                ? 'error'
                : (currentResource.value ?? 'pending')}
            </output>
          </main>
        );
      }

      const model: QualityModel = {
        rows: [1, 2, 3],
        show: true,
        mode: 'a',
        mounted: true,
        portal: true,
        route: '/quality/a',
      };
      const operations = createTrace(seed);
      let operationIndex = 0;
      let failure: unknown = null;

      const qualityRegistry = createRouteRegistry(() => {
        route('/quality/a', () => <QualityApp />);
      });
      const navigationRegistry = createRouteRegistry(() => {
        route('/quality/a', () => (
          <div data-quality-route={'a'}>{'route-a'}</div>
        ));
        route('/quality/b', () => (
          <div data-quality-route={'b'}>{'route-b'}</div>
        ));
        route(
          '/quality/slow',
          () => <div data-quality-route={'slow'}>{'route-slow'}</div>,
          { policies: [() => guard.promise] }
        );
      });

      window.history.replaceState({}, '', '/quality/a');
      if (bootMode === 'hydration') {
        container.innerHTML = renderToStringSync(QualityApp);
        await hydrateSPA({ root: container, registry: qualityRegistry });
      } else {
        await createSPA({
          root: container,
          registry: qualityRegistry,
        });
      }
      await createSPA({
        root: navigation.container,
        registry: navigationRegistry,
      });
      flushScheduler();

      const runOperation = async (
        operation: QualityOperation
      ): Promise<void> => {
        switch (operation) {
          case 'mount-update-dispose': {
            mounted.set(!mounted());
            model.mounted = !model.mounted;
            flushScheduler();
            mounted.set(!mounted());
            model.mounted = !model.mounted;
            flushScheduler();
            break;
          }
          case 'show-case-failure-retry': {
            mode.set(mode() === 'a' ? 'b' : 'a');
            model.mode = model.mode === 'a' ? 'b' : 'a';
            branchFailure.set(true);
            try {
              flushScheduler();
            } catch (error) {
              expect(error).toBeInstanceOf(Error);
            }
            branchFailure.set(false);
            flushScheduler();
            break;
          }
          case 'keyed-reorder': {
            const nextRows =
              model.rows.length === 3
                ? [model.rows[2]!, model.rows[0]!, model.rows[1]!]
                : [1, 2, 3];
            const next = nextRows.map((id) => ({ id, label: `row-${id}` }));
            rows.set(next);
            model.rows = nextRows;
            flushScheduler();
            expect(
              Array.from(
                container.querySelectorAll<HTMLElement>('[data-quality-row]'),
                (node) => Number(node.dataset.qualityRow)
              )
            ).toEqual(model.rows);
            break;
          }
          case 'navigation-cancel': {
            navigate('/quality/slow');
            navigate('/quality/b');
            model.route = '/quality/b';
            flushScheduler();
            guard.resolve({ kind: 'allow' });
            await Promise.resolve();
            await Promise.resolve();
            flushScheduler();
            expect(window.location.pathname).toBe('/quality/b');
            break;
          }
          case 'popstate': {
            window.history.pushState({ path: '/quality/a' }, '', '/quality/a');
            window.dispatchEvent(
              new PopStateEvent('popstate', { state: { path: '/quality/a' } })
            );
            model.route = '/quality/a';
            flushScheduler();
            expect(window.location.pathname).toBe('/quality/a');
            break;
          }
          case 'resource-resolve': {
            const nextEpoch = resourceEpoch() + 1;
            resourceEpoch.set(nextEpoch);
            flushScheduler();
            if (bootMode === 'hydration') {
              expect(
                container.querySelector('[data-quality-resource]')?.textContent
              ).toBe('hydrated');
              break;
            }
            getResourceDeferred(nextEpoch).resolve(`ready-${nextEpoch}`);
            await Promise.resolve();
            await Promise.resolve();
            flushScheduler();
            expect(
              container.querySelector('[data-quality-resource]')?.textContent
            ).toContain('ready');
            break;
          }
          case 'resource-reject': {
            const nextEpoch = resourceEpoch() + 1;
            resourceEpoch.set(nextEpoch);
            flushScheduler();
            if (bootMode === 'hydration') {
              expect(
                container.querySelector('[data-quality-resource]')?.textContent
              ).toBe('hydrated');
              break;
            }
            getResourceDeferred(nextEpoch).reject(
              new Error(`reject-${nextEpoch}`)
            );
            await Promise.resolve();
            await Promise.resolve();
            flushScheduler();
            expect(
              container.querySelector('[data-quality-resource]')?.textContent
            ).toBe('error');
            break;
          }
          case 'resource-abort': {
            const oldSignal = latestSignal;
            const nextEpoch = resourceEpoch() + 1;
            resourceEpoch.set(nextEpoch);
            flushScheduler();
            expect(oldSignal?.aborted ?? true).toBe(true);
            break;
          }
          case 'portal-teardown': {
            portalVisible.set(!portalVisible());
            model.portal = !model.portal;
            flushScheduler();
            expect(
              container.querySelector('[data-quality-portal]') !== null
            ).toBe(model.portal);
            break;
          }
          case 'cleanup-failure': {
            const instance = createComponentInstance(
              'quality-cleanup',
              () => null,
              {},
              null
            );
            instance.cleanupStrict = true;
            (instance.owner.cleanups ??= []).push(() => {
              throw new Error('quality cleanup failure');
            });
            let cleanupError: unknown = null;
            try {
              cleanupComponent(instance);
            } catch (error) {
              cleanupError = error;
            }
            expect(cleanupError).toBeInstanceOf(AggregateError);
            expect(
              (cleanupError as AggregateError).errors.some(
                (error) =>
                  error instanceof Error &&
                  error.message === 'quality cleanup failure'
              )
            ).toBe(true);
            break;
          }
          case 'renderer-rollback': {
            branchFailure.set(true);
            expect(() => flushScheduler()).toThrow(/quality branch failure/);
            branchFailure.set(false);
            flushScheduler();
            expect(
              container.querySelector('[data-quality-show="start"]')
            ).not.toBeNull();
            break;
          }
          case 'scheduler-failure-reschedule': {
            let failed = false;
            enqueueRuntimeLane('reactive', () => {
              failed = true;
              throw new Error('quality scheduler lane failure');
            });
            expect(() => flushScheduler()).toThrow(
              /quality scheduler lane failure/
            );
            expect(failed).toBe(true);
            let rescheduled = false;
            enqueueRuntimeLane('post', () => {
              rescheduled = true;
            });
            flushScheduler();
            expect(rescheduled).toBe(true);
            expectSchedulerQuiescent();
            break;
          }
        }
      };

      try {
        for (
          operationIndex = 0;
          operationIndex < operations.length;
          operationIndex += 1
        ) {
          await runOperation(operations[operationIndex]!);
        }
        expectSchedulerQuiescent();
      } catch (error) {
        failure = error;
        writeQualityTrace(
          bootMode,
          seed,
          operations,
          operations.slice(0, operationIndex + 1),
          model,
          observeQualityState(container, navigation.container),
          error
        );
      } finally {
        cleanupApp(navigation.container);
        navigation.cleanup();
        cleanup();
        _resetDefaultPortal();
      }

      if (failure) {
        throw failure;
      }

      expect(trackedCleanupCount).toBeGreaterThan(0);
      await Promise.resolve();
      flushScheduler();
      expectSchedulerQuiescent();
    }
  );

  it('should parse explicit seed ranges without duplicating seeds', () => {
    expect(resolveLifecycleQualitySeeds('1,7,7,0x2a,3..5')).toEqual([
      1, 7, 42, 3, 4, 5,
    ]);
  });
});
