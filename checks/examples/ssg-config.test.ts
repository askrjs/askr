import { describe, expect, it } from 'vite-plus/test';
import {
  concurrency,
  dataOverrides,
  routes,
  seed,
} from '../../examples/ssg.config';

describe('examples/ssg.config.ts', () => {
  it('loads through the public SSG API and provides a valid minimal config', () => {
    expect(routes).toHaveLength(2);
    expect(routes.map((route) => route.path)).toEqual(['/', '/about']);
    expect(routes.every((route) => typeof route.component === 'function')).toBe(
      true
    );
    expect(dataOverrides['/']).toEqual({ appName: 'askr' });
    expect(dataOverrides['/about']).toEqual({ section: 'about' });
    expect(seed).toBe(12345);
    expect(concurrency).toBe(1);
  });
});
