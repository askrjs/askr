import { describe, expect, it } from 'vite-plus/test';
import {
  cleanupComponent,
  createComponentInstance,
} from '../../../src/runtime/component';

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

describe('lifecycle sequence invariants', () => {
  it.each(resolveLifecycleQualitySeeds())(
    'replays mount/update/flush/dispose ownership for seed %# (%i)',
    (seed) => {
      const next = seeded(seed);
      let cleanupCount = 0;
      let abortCount = 0;
      const instance = createComponentInstance(
        'sequence',
        () => null,
        {},
        null
      );
      const controller = new AbortController();
      controller.signal.addEventListener('abort', () => {
        abortCount += 1;
      });
      instance.abortController = controller;
      instance.mounted = true;
      instance.notifyUpdate = () => {};
      instance.cleanupFns.push(() => {
        cleanupCount += 1;
      });

      for (let step = 0; step < 32; step += 1) {
        instance.lifecycleGeneration += next() % 2;
        instance.evaluationGeneration += next() % 2;
      }

      cleanupComponent(instance);
      expect(cleanupCount).toBe(1);
      expect(abortCount).toBe(1);
      expect(instance.mounted).toBe(false);
      expect(instance.notifyUpdate).toBeNull();

      cleanupComponent(instance);
      expect(cleanupCount).toBe(1);
      expect(abortCount).toBe(1);
    }
  );

  it('should parse explicit seed ranges without duplicating seeds', () => {
    expect(resolveLifecycleQualitySeeds('1,7,7,0x2a,3..5')).toEqual([
      1, 7, 42, 3, 4, 5,
    ]);
  });
});
