import { describe, it, expect } from 'vitest';
import type { ConfigEnv, UserConfig, ConfigPluginContext } from 'vite';
import { askrVitePlugin } from '../../src/dev/vite-plugin-askr';

describe('askrVitePlugin', () => {
  it('should configure esbuild injection and include runtime in optimizeDeps', async () => {
    const plugin = askrVitePlugin();

    let cfg: unknown;
    if (plugin.config) {
      // plugin.config can be either a function or an object with a handler
      if (typeof plugin.config === 'function') {
        cfg = await plugin.config.call({} as ConfigPluginContext, {}, {
          command: 'serve',
          mode: 'development',
        } as ConfigEnv);
      } else if (
        typeof plugin.config === 'object' &&
        'handler' in plugin.config &&
        typeof plugin.config.handler === 'function'
      ) {
        cfg = await plugin.config.handler.call({} as ConfigPluginContext, {}, {
          command: 'serve',
          mode: 'development',
        } as ConfigEnv);
      }
    }

    expect(cfg).toBeDefined();

    const userCfg = cfg as UserConfig;

    const esbuild = userCfg?.esbuild as unknown as { jsxInject?: string };
    expect(esbuild).toBeDefined();
    expect(String(esbuild.jsxInject).includes('@askrjs/askr/jsx-runtime')).toBe(
      true
    );

    const includes = userCfg?.optimizeDeps?.include ?? [];
    expect(includes.includes('@askrjs/askr/jsx-runtime')).toBe(true);
  });

  it('should ignore unsupported ssrPrecompile flags instead of injecting fake helpers', async () => {
    const plugin = askrVitePlugin({
      transformJsx: false,
      // Intentionally passed through `any` so we can guard against stale config.
      ...( { ssrPrecompile: true } as Record<string, unknown> ),
    } as never);

    if (!plugin.transform) throw new Error('plugin missing transform hook');

    type TransformHook = (
      code: string,
      id: string,
      options?: { ssr?: boolean }
    ) => Promise<{ code: string; map?: unknown } | null>;

    const result = await (plugin.transform as TransformHook)(
      'export const View = () => <div>Hello</div>;',
      'view.tsx',
      { ssr: true }
    );

    expect(result).toBeNull();
  });
});
