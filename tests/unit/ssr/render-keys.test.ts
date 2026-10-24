import { describe, expect, it } from 'vite-plus/test';
import {
  getCurrentRenderData,
  getNextKey,
  startHydrationRenderPhase,
  startRenderPhase,
  stopHydrationRenderPhase,
  stopRenderPhase,
} from '../../../src/ssr/render-keys';
import {
  createRenderContext,
  withRenderContext,
} from '../../../src/ssr/context';
import { createPageRenderEnvelope } from '../../../src/common/page-render-envelope';

describe('SSR render key phases', () => {
  it('should expose plain resources and envelopes alike during a render phase', () => {
    withRenderContext(createRenderContext(1, {}), () => {
      startRenderPhase({ a: 1 });
      try {
        expect(getCurrentRenderData()).toEqual({ a: 1 });
      } finally {
        stopRenderPhase();
      }
      startRenderPhase(createPageRenderEnvelope({ resources: { b: 2 } }));
      try {
        expect(getCurrentRenderData()).toEqual({ b: 2 });
      } finally {
        stopRenderPhase();
      }
      startRenderPhase(null);
      try {
        expect(getCurrentRenderData()).toBeNull();
      } finally {
        stopRenderPhase();
      }
    });
  });

  it('should accept plain data and envelopes for the hydration phase', () => {
    for (const data of [
      { c: 3 },
      createPageRenderEnvelope({ resources: { d: 4 } }),
    ]) {
      startHydrationRenderPhase(data);
      try {
        expect(typeof getNextKey()).toBe('string');
      } finally {
        stopHydrationRenderPhase();
      }
    }
  });
});
