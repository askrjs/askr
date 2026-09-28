import { describe, expect, it } from 'vite-plus/test';
import * as askr from '../../../src/index';

describe('public entry exports', () => {
  it('should not expose event delegation toggles on the public entry', () => {
    expect('enableEventDelegation' in askr).toBe(false);
  });
});
