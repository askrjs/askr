/**
 * Common call contracts: SSR types
 */

export type SSRData = Record<string, unknown>;

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
