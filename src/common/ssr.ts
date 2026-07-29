/**
 * Common call contracts: SSR types
 */

export type SSRData = Record<string, unknown>;

/** Styles produced while rendering a request, kept with that request's SSR context. */
export interface SSRStyleRegistration {
  id: string;
  cssText: string;
}

export interface DocumentRenderRoute {
  path: string;
  namespace?: string;
}

export interface DocumentRenderContext {
  mode: 'ssr' | 'ssg';
  url: string;
  pathname: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  data?: SSRData;
  seed: number;
  route: DocumentRenderRoute;
  cspNonce?: string;
  styles?: readonly SSRStyleRegistration[];
}

export interface DocumentRenderArgs {
  appHtml: string;
  context: DocumentRenderContext;
}

export type DocumentRenderer = (args: DocumentRenderArgs) => string;

export function renderDocument(
  document: DocumentRenderer,
  args: DocumentRenderArgs,
  apiName: string
): string {
  const html: unknown = document(args);

  if (typeof html !== 'string') {
    const isPromiseLike =
      typeof html === 'object' &&
      html !== null &&
      'then' in html &&
      typeof html.then === 'function';
    const received = isPromiseLike
      ? 'a Promise-like value'
      : html === null
        ? 'null'
        : Array.isArray(html)
          ? 'an array'
          : typeof html;

    throw new Error(
      `${apiName} document() must synchronously return a string; received ${received}.`
    );
  }

  return html;
}

export const SSR_RENDER_DATA_ATTR = 'data-askr-render-data';

/** Full context for sink-based streaming SSR */
export type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};

/** Lightweight context for synchronous render passes */
export type RenderContext = {
  seed: number;
};
