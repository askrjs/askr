import { describe, expect, it } from 'vite-plus/test';
import * as askr from '../../../src/index';
import { getDefaultRuntime } from '../../../src/experimental';

describe('public entry renderer bridge', () => {
  it('should configure the default runtime renderer host', () => {
    const bridge = getDefaultRuntime().renderer;

    expect(typeof bridge.evaluate).toBe('function');
    expect(typeof bridge.markReactivePropsDirtySource).toBe('function');
    expect(typeof bridge.isKeyedReorderFastPathEligible).toBe('function');
    expect(typeof bridge.getKeyMapForElement).toBe('function');
  });

  it('should not expose event delegation toggles on the public entry', () => {
    expect('enableEventDelegation' in askr).toBe(false);
  });
});
