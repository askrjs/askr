import { describe, it, expect } from 'vitest';
import { collectResources, type SSRRoute } from '../../src/ssr';

describe('SSR prepass collection (deprecated)', () => {
  it('should disable collectResources() under the synchronous SSR model', () => {
    expect(() =>
      collectResources({ url: '/', routes: [] as unknown as SSRRoute[] })
    ).toThrow(/collectResources.*removed|prepass.*removed/i);
  });
});
