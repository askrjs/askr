import { describe, expect, it, vi } from 'vite-plus/test';

describe('reactive scheduling recovery', () => {
  for (const kind of ['derive', 'selector', 'effect'] as const) {
    for (const interruption of ['clear', 'reject'] as const) {
      it(`should resume ${kind} after scheduler ${interruption}`, async () => {
        // A broken pending flag must not contaminate another regression case.
        vi.resetModules();
        const { state, derive, selector } = await import('../../../src/index');
        const { createIsland, cleanupApp } = await import('../../../src/boot');
        const { globalScheduler: scheduler } =
          await import('../../../src/runtime/scheduler');
        const { createFineGrainedEffect } =
          await import('../../../src/runtime/reactivity/effect');
        const root = document.createElement('div');
        document.body.append(root);
        let write!: (value: number) => void;
        let read!: () => unknown;
        createIsland({
          root,
          component: () => {
            const source = state(0);
            write = (value) => source.set(value);
            if (kind === 'derive') read = derive(() => source() * 10);
            else if (kind === 'selector') {
              const selected = selector(source);
              read = () => selected(2);
            } else read = source;
            return null;
          },
        });
        const values: unknown[] = [];
        const effect = createFineGrainedEffect({
          lane: 'reactive',
          compute: read,
          commit: (value) => values.push(value),
        });
        scheduler.flush();
        try {
          if (interruption === 'clear') {
            write(1);
            expect(scheduler.clearPendingSyncTasks()).toBeGreaterThan(0);
          } else {
            scheduler.setBulkCommitProbe(() => true);
            // Effect notifications deliberately suppress renderer errors.
            if (kind === 'effect') write(1);
            else expect(() => write(1)).toThrow('during bulk commit');
            scheduler.setBulkCommitProbe(() => false);
          }
          write(2);
          scheduler.flush();
          expect(values.at(-1)).toBe(
            kind === 'derive' ? 20 : kind === 'selector' ? true : 2
          );
          expect(scheduler.getState().queueLength).toBe(0);
        } finally {
          scheduler.setBulkCommitProbe(() => false);
          effect.cleanup();
          cleanupApp(root);
          scheduler.flushIfQueued();
          root.remove();
        }
      });
    }
  }
});
