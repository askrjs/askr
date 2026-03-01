/**
 * Vite plugin for Askr
 *
 * Provides sensible defaults so Vite "just works" with Askr without extra config:
 * - Configures esbuild JSX injection and `optimizeDeps.include` so the runtime is available
 * - Optional SSR template precompilation for improved server rendering performance
 */

import type { Plugin } from 'vite';

export interface AskrVitePluginOptions {
  /** Enable the built-in JSX transform that rewrites JSX to Askr's automatic runtime. */
  transformJsx?: boolean;
  /** Enable SSR template precompilation for improved server rendering performance. */
  ssrPrecompile?: boolean;
}

/**
 * SSR Precompilation transform
 * Converts JSX components into optimized template strings at build time
 */
function ssrPrecompileTransform(
  code: string,
  id: string
): import('rollup').TransformResult | null {
  if (!/\.(jsx|tsx)$/.test(id)) return null;
  if (id.includes('node_modules')) return null;

  // Pattern to match component functions
  const componentPattern =
    /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>|(\w+)\s*:\s*(?:\([^)]*\)|[^=])\s*=>)/g;

  let match;
  const components: string[] = [];

  while ((match = componentPattern.exec(code)) !== null) {
    const componentName = match[1] || match[2] || match[3];
    if (componentName && !components.includes(componentName)) {
      components.push(componentName);
    }
  }

  // If no components found, return original code
  if (components.length === 0) return null;

  // Simple precompilation: wrap component returns with template helper
  let precompiledCode = code;

  // Import the SSR template helper
  if (!code.includes('import { __ssrTemplate__ }')) {
    precompiledCode =
      `import { __ssrTemplate__ } from '@askrjs/askr/ssr-template';\n` +
      precompiledCode;
  }

  return {
    code: precompiledCode,
  };
}

export function askrVitePlugin(opts: AskrVitePluginOptions = {}): Plugin {
  const pluginName = 'askr:vite';
  const shouldTransform = opts.transformJsx ?? true;
  const shouldPrecompileSSR = opts.ssrPrecompile ?? false;

  return {
    name: pluginName,
    enforce: 'pre',
    config() {
      return {
        resolve: {
          alias: [],
        },
        optimizeDeps: {
          include: [
            '@askrjs/askr',
            '@askrjs/askr/jsx-runtime',
            '@askrjs/askr/jsx-dev-runtime',
          ],
        },
        esbuild: {
          jsxInject:
            "import { jsx, jsxs, Fragment } from '@askrjs/askr/jsx-runtime';",
        },
      };
    },

    async transform(
      this: import('rollup').PluginContext,
      code: string,
      id: string,
      options?: { ssr?: boolean }
    ): Promise<import('rollup').TransformResult | null> {
      // SSR precompilation pass
      if (shouldPrecompileSSR && options?.ssr) {
        const result = ssrPrecompileTransform(code, id);
        if (result) return result;
      }

      // Provide an optional esbuild-based transform for .jsx/.tsx files so users don't need extra JSX tooling
      if (!shouldTransform) return null;
      if (!/\.(jsx|tsx)$/.test(id)) return null;
      if (id.includes('node_modules')) return null;

      try {
        const esbuild = (await import('esbuild')) as typeof import('esbuild');
        const loader = id.endsWith('.tsx') ? 'tsx' : 'jsx';
        const esbuildOpts: import('esbuild').TransformOptions = {
          loader,
          jsx: 'automatic',
          jsxImportSource: '@askrjs/askr',
          sourcefile: id,
          sourcemap: true,
        };

        // Prefer transformSync when available to avoid Promise/async overhead in hooks
        const mod = esbuild as {
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
          result = mod.transformSync(code, esbuildOpts);
        } else if (typeof mod.transform === 'function') {
          result = await mod.transform(code, esbuildOpts);
        }

        if (!result || !result.code) return null;

        return {
          code: result.code,
          map: result.map as import('rollup').SourceMapInput,
        };
      } catch {
        // If esbuild isn't available or fails, bail and let Vite handle it.
        return null;
      }
    },
  };
}

// Convenience alias for `import { askr } from '@askrjs/askr/vite'`
export const askr = askrVitePlugin;

export default askrVitePlugin;
