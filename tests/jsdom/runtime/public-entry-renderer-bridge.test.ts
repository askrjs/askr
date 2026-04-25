import { describe, expect, it } from 'vite-plus/test';
import * as askr from '../../../src/index';

describe('public entry renderer bridge', () => {
  it('should install the renderer bridge on globalThis', () => {
    const bridge = (
      globalThis as typeof globalThis & {
        __ASKR_RENDERER?: Record<string, unknown>;
      }
    ).__ASKR_RENDERER;

    expect(typeof bridge?.evaluate).toBe('function');
    expect(typeof bridge?.markReactivePropsDirtySource).toBe('function');
    expect(typeof bridge?.isKeyedReorderFastPathEligible).toBe('function');
    expect(typeof bridge?.getKeyMapForElement).toBe('function');
  });

  it('should not expose event delegation toggles on the public entry', () => {
    expect('enableEventDelegation' in askr).toBe(false);
  });
});
