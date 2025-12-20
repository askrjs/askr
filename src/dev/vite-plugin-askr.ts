/**
 * Vite plugin for Askr
 *
 * Provides sensible defaults so Vite "just works" with Askr without extra config:
 * - Configures esbuild JSX injection and `optimizeDeps.include` so the runtime is available
 */

import type { Plugin } from 'vite';

export interface AskrVitePluginOptions {
  /** Enable the built-in JSX transform that rewrites JSX to Askr's automatic runtime. */
  transformJsx?: boolean;
}

export function askrVitePlugin(opts: AskrVitePluginOptions = {}): Plugin {
  const pluginName = 'askr:vite';
  const shouldTransform = opts.transformJsx ?? true;

  return {
    name: pluginName,
    enforce: 'pre',
    config() {
      return {
        resolve: {
          // No automatic remapping of other frameworks; avoid referencing other frameworks in this package
          alias: [],
        },
        optimizeDeps: {
          include: [
            '@askrjs/askr',
            '@askrjs/askr/jsx-runtime',
            '@askrjs/askr/jsx-dev-runtime',
          ],
        },
        // For esbuild users, inject the import so transforms that rely on an injected symbol work.
        esbuild: {
          jsxInject:
            "import { jsx, jsxs, Fragment } from '@askrjs/askr/jsx-runtime';",
        },
      } as const;
    },

    async transform(code, id) {
      // Provide an optional esbuild-based transform for .jsx/.tsx files so users don't need extra JSX tooling
      if (!shouldTransform) return null;
      if (!/\.(jsx|tsx)$/.test(id)) return null;
      if (id.includes('node_modules')) return null;

      try {
        const esbuild = (await import('esbuild')) as typeof import('esbuild');
        const loader = id.endsWith('.tsx') ? 'tsx' : 'jsx';
        const opts: import('esbuild').TransformOptions = {
          loader,
          jsx: 'automatic',
          jsxImportSource: '@askrjs/askr',
          sourcefile: id,
          sourcemap: true,
        };

        // Prefer transformSync when available to avoid Promise/async overhead in hooks
        const mod = esbuild as unknown as {
          transformSync?: (
            source: string,
            options: import('esbuild').TransformOptions
          ) => import('esbuild').TransformResult;
          transform?: (
            source: string,
            options: import('esbuild').TransformOptions
          ) => Promise<import('esbuild').TransformResult>;
        };

        let result: import('esbuild').TransformResult | null = null;
        if (typeof mod.transformSync === 'function') {
          result = mod.transformSync(code, opts);
        } else if (typeof mod.transform === 'function') {
          result = await mod.transform(code, opts);
        }

        if (!result || !result.code) return null;

        return {
          code: result.code,
          map: result.map as unknown,
        };
      } catch {
        // If esbuild isn't available or fails, bail and let Vite handle it. Do not rely on framework-specific dev deps.
        return null;
      }
    },
  };
}

// Convenience alias for `import { askr } from '@askrjs/askr/vite'`
export const askr = askrVitePlugin;

export default askrVitePlugin;
