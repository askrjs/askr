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
});
