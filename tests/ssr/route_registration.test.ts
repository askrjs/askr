import { describe, it, expect } from 'vitest';
import { renderToStringSync } from '../../src/index';
import { route } from '../../src/router/route';

describe('SSR route registration', () => {
  it('should not allow route registration during SSR', () => {
    const Comp = () => {
      route('/x', () => ({ type: 'div' }));
      return { type: 'div' };
    };

    expect(() => renderToStringSync(Comp)).toThrow(
      /route\(\) cannot be called during SSR|route\(\) can only be called during component render/i
    );
  });
});
