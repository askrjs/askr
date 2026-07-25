import { describe, expect, it } from 'vite-plus/test';
import {
  concurrency,
  dataOverrides,
  registry,
  seed,
} from '../../../examples/ssg.config';

describe('examples/ssg.config.ts', () => {
  it('should load through the public SSG API and provide a valid minimal config', () => {
    expect(registry.manifest.records.map((route) => route.path).sort()).toEqual(
      ['/', '/about']
    );
    expect(dataOverrides['/']).toEqual({ appName: 'askr' });
    expect(dataOverrides['/about']).toEqual({ section: 'about' });
    expect(seed).toBe(12345);
    expect(concurrency).toBe(1);
  });
});
