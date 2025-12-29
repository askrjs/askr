import { renderToString, type SSRRoute } from './index';

type ExecutionModel = 'spa' | 'islands' | 'ssr';
const EXECUTION_MODEL_KEY = Symbol.for('__ASKR_EXECUTION_MODEL__');

function assertExecutionModel(model: ExecutionModel): void {
  const g = globalThis as unknown as Record<string | symbol, unknown>;
  const cur = g[EXECUTION_MODEL_KEY] as ExecutionModel | undefined;
  if (cur && cur !== model) {
    throw new Error(
      `[Askr] mixing execution models is not allowed (current: ${cur}, attempted: ${model}). ` +
        `Choose exactly one: createSPA, createSSR, or createIslands.`
    );
  }
  if (!cur) g[EXECUTION_MODEL_KEY] = model;
}

export type SSRConfig = {
  routes: SSRRoute[];
  seed?: number;
};

export type SSRApp = {
  /** Render a URL to HTML. SSR is synchronous; async during render throws. */
  render(url: string, data?: Record<string, unknown> | null): string;
};

/**
 * createSSR: constructs a strict SSR renderer.
 *
 * - Exactly one execution model (SSR)
 * - Routes are required
 * - Rendering is synchronous and deterministic
 */
export function createSSR(config: SSRConfig): SSRApp {
  assertExecutionModel('ssr');
  if (!config || typeof config !== 'object') {
    throw new Error('createSSR requires a config object');
  }
  if (!Array.isArray(config.routes) || config.routes.length === 0) {
    throw new Error('createSSR requires a non-empty routes array');
  }

  const seed = config.seed ?? 12345;
  const routes = config.routes;

  return {
    render(url: string, data?: Record<string, unknown> | null): string {
      if (typeof url !== 'string' || url.length === 0) {
        throw new Error(
          'createSSR().render(url): url must be a non-empty string'
        );
      }
      return renderToString({ url, routes, seed, data: data ?? undefined });
    },
  };
}
