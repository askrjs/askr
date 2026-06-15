/**
 * Common call contracts: SSR types
 */

export type SSRData = Record<string, unknown>;

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
}

export interface DocumentRenderArgs {
  appHtml: string;
  context: DocumentRenderContext;
}

export type DocumentRenderer = (args: DocumentRenderArgs) => string;

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
