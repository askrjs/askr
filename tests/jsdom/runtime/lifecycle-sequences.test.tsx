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

describe('lifecycle sequence invariants', () => {
  it.each([1, 7, 42, 0xc0ffee])(
    'replays mount/update/flush/dispose ownership for seed %# (%i)',
    (seed) => {
      const next = seeded(seed);
      let cleanupCount = 0;
      let abortCount = 0;
      const instance = createComponentInstance('sequence', () => null, {}, null);
      const controller = new AbortController();
      controller.signal.addEventListener('abort', () => { abortCount += 1; });
      instance.abortController = controller;
      instance.mounted = true;
      instance.notifyUpdate = () => {};
      instance.cleanupFns.push(() => { cleanupCount += 1; });

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
});
