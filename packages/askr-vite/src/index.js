import { transformWithOxc } from 'vite';

export function askrVitePlugin(opts = {}) {
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
            '@askrjs/askr/router',
            '@askrjs/askr/boot',
            '@askrjs/askr/for',
            '@askrjs/askr/fx',
            '@askrjs/askr/resources',
            '@askrjs/askr/jsx-runtime',
            '@askrjs/askr/jsx-dev-runtime',
          ],
        },
        oxc: {
          jsx: {
            runtime: 'automatic',
            importSource: '@askrjs/askr',
          },
          jsxInject:
            "import { jsx, jsxs, Fragment } from '@askrjs/askr/jsx-runtime';",
        },
      };
    },

    async transform(code, id) {
      if (!shouldTransform) return null;
      if (!/\.(jsx|tsx)$/.test(id)) return null;
      if (id.includes('node_modules')) return null;

      try {
        const lang = id.endsWith('.tsx') ? 'tsx' : 'jsx';
        const result = await transformWithOxc(code, id, {
          lang,
          jsx: {
            runtime: 'automatic',
            importSource: '@askrjs/askr',
          },
          sourcemap: true,
        });

        if (!result || !result.code) return null;

        const codeOut = shouldOptimizeTemplates
          ? optimizeTemplateOutput(result.code)
          : result.code;

        return {
          code: codeOut,
          map: result.map,
        };
      } catch {
        return null;
      }
    },
  };
}

function optimizeTemplateOutput(code) {
  const hoists = new Map();
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

export const askr = askrVitePlugin;

export default askrVitePlugin;
