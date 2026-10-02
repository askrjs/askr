import { describe, expect, test } from 'vite-plus/test';
import { createIsland } from '../../src/boot';
import { state } from '../../src';
import { Owner } from '../../src/core/reactive/owner';
import {
  clearScheduler,
  flushSync,
  schedule,
  type Job,
} from '../../src/core/reactive/scheduler';
import {
  createTestContainer,
  flushScheduler,
} from '../../test-utils/render/test-renderer';
import { tier2BenchOptions, runBench } from '../shared/_shared';

// Scaling checks for the owner tree, scheduler lanes, and component patching
// (#612). Each bench is linear after the fix and quadratic before it.

const siblingCount = 10_000;
const renderJobCount = 5_000;
const effectJobCount = 20_000;
const chainDepth = 2_000;

function detachSiblingsFrontToBack(count: number): void {
  const parent = new Owner(null);
  const children = Array.from({ length: count }, () => new Owner(parent));
  for (const child of children) child.dispose();
  parent.dispose();
}

function flushJobs(count: number, lane: 'render' | 'effect'): number {
  let ran = 0;
  for (let index = 0; index < count; index++) {
    const job: Job = {
      depth: lane === 'render' ? (index * 7919) % 64 : 0,
      run: () => {
        ran++;
      },
    };
    schedule(job, lane);
  }
  flushSync();
  return ran;
}

function Chain(props: { remaining: number; label: string }) {
  return props.remaining === 0 ? (
    <span data-chain-leaf={'true'}>{props.label}</span>
  ) : (
    <Chain remaining={props.remaining - 1} label={props.label} />
  );
}

function mountChain(depth: number) {
  const fixture = createTestContainer();
  let label!: ReturnType<typeof state<string>>;
  createIsland({
    root: fixture.container,
    component: () => {
      label = state('a');
      return <Chain remaining={depth} label={label()} />;
    },
  });
  flushScheduler();
  const leaf = () =>
    fixture.container.querySelector('[data-chain-leaf]')?.textContent;
  return {
    update(next: string) {
      label.set(next);
      flushScheduler();
    },
    leaf,
    cleanup: fixture.cleanup,
  };
}

{
  detachSiblingsFrontToBack(100);
  clearScheduler();
  expect(flushJobs(100, 'render')).toBe(100);
  expect(flushJobs(100, 'effect')).toBe(100);
  const chain = mountChain(20);
  chain.update('b');
  expect(chain.leaf()).toBe('b');
  chain.cleanup();
}

describe('tier2 core scaling', () => {
  test('dispose 10,000 sibling owners front to back', async ({ bench }) => {
    await runBench(
      bench,
      'dispose 10,000 sibling owners front to back',
      () => detachSiblingsFrontToBack(siblingCount),
      tier2BenchOptions
    );
  });

  test('flush 5,000 render jobs at mixed depths', async ({ bench }) => {
    await runBench(
      bench,
      'flush 5,000 render jobs at mixed depths',
      () => {
        flushJobs(renderJobCount, 'render');
      },
      { ...tier2BenchOptions, teardown: () => clearScheduler() }
    );
  });

  test('flush 20,000 effect jobs', async ({ bench }) => {
    await runBench(
      bench,
      'flush 20,000 effect jobs',
      () => {
        flushJobs(effectJobCount, 'effect');
      },
      { ...tier2BenchOptions, teardown: () => clearScheduler() }
    );
  });

  let chain: ReturnType<typeof mountChain> | null = null;
  let next = 0;
  test('patch every component in a 2,000-deep chain', async ({ bench }) => {
    await runBench(
      bench,
      'patch every component in a 2,000-deep chain',
      () => {
        chain!.update(`v${++next}`);
      },
      {
        ...tier2BenchOptions,
        setup() {
          chain = mountChain(chainDepth);
        },
        teardown() {
          chain?.cleanup();
          chain = null;
        },
      }
    );
  });
});
