import { describe, expect, it } from 'vite-plus/test';
import { Computation } from '../../../src/core/reactive/graph';

describe('computation shape', () => {
  it('should declare the derived flag on every computation as a constructor field', () => {
    const computation = new Computation(null, () => 1, null);
    expect(Object.keys(computation)).toContain('_derived');
    expect(computation._derived).toBe(false);
  });
});
