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
  /**
   * Opt-in lightweight template lowering.
   * Current v1 optimization hoists repeated static class and style string literals.
   */
  optimizeTemplates?: boolean;
  /**
   * Deprecated no-op kept for compatibility with older configs.
   * SSR precompilation is no longer supported by this plugin.
   */
  ssrPrecompile?: boolean;
}

export function askrVitePlugin(opts: AskrVitePluginOptions = {}): Plugin {
  const pluginName = 'askr:vite';
  const shouldTransform = opts.transformJsx ?? true;
  const shouldOptimizeTemplates = opts.optimizeTemplates ?? false;

  return {
    name: pluginName,
    enforce: 'pre',
    config() {
      return {
        define: {
          __ASKR_OPTIMIZE_TEMPLATES__: JSON.stringify(shouldOptimizeTemplates),
        },
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
      _options?: { ssr?: boolean }
    ): Promise<import('rollup').TransformResult | null> {
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

        const codeOut = shouldOptimizeTemplates
          ? optimizeTemplateOutput(result.code)
          : result.code;

        return {
          code: codeOut,
          map: result.map as import('rollup').SourceMapInput,
        };
      } catch {
        // If esbuild isn't available or fails, bail and let Vite handle it.
        return null;
      }
    },
  };
}

function optimizeTemplateOutput(code: string): string {
  const hoists = new Map<string, string>();
  let hoistIndex = 0;

  const optimized = code.replace(
    /\b(class|className|style):\s*("([^"\\]|\\.)*")/g,
    (fullMatch, key, literal) => {
      const cacheKey = `${key}:${literal}`;
      let identifier = hoists.get(cacheKey);
      if (!identifier) {
        const occurrenceCount = code.split(fullMatch).length - 1;
        if (occurrenceCount < 2) {
          return fullMatch;
        }
        identifier = `__askrStaticLiteral${hoistIndex++}`;
        hoists.set(cacheKey, identifier);
      }
      return `${key}: ${identifier}`;
    }
  );

  if (hoists.size === 0) {
    return code;
  }

  const declarations = Array.from(hoists.entries()).map(([cacheKey, name]) => {
    const literal = cacheKey.slice(cacheKey.indexOf(':') + 1);
    return `const ${name} = ${literal};`;
  });

  return `${declarations.join('\n')}\n${optimized}`;
}

// Convenience alias for `import { askr } from '@askrjs/askr/vite'`
export const askr = askrVitePlugin;

export default askrVitePlugin;
