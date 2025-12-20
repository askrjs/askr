import { describe, it, expect } from 'vitest';
import type { ConfigEnv } from 'vite';
import { askrVitePlugin } from '../../src/dev/vite-plugin-askr';

describe('askrVitePlugin', () => {
  it('should configure esbuild injection and include runtime in optimizeDeps', () => {
    const plugin = askrVitePlugin();
    const cfg = plugin.config
      ? plugin.config({}, {
          command: 'serve',
          mode: 'development',
        } as ConfigEnv)
      : undefined;

    expect(cfg).toBeDefined();

    const esbuild = cfg?.esbuild as unknown as { jsxInject?: string };
    expect(esbuild).toBeDefined();
    expect(String(esbuild.jsxInject).includes('@askrjs/askr/jsx-runtime')).toBe(
      true
    );

    const includes = cfg?.optimizeDeps?.include ?? [];
    expect(includes.includes('@askrjs/askr/jsx-runtime')).toBe(true);
  });
});
