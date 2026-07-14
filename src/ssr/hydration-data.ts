import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import type { SSRData } from './context';
import type { DataRuntime } from '../data/types';
import { dehydrateDataRuntime } from '../data/query-registry';

export function serializeHydrationRenderData(
  data: SSRData | undefined,
  runtime?: DataRuntime
): string {
  const queryCache = runtime ? dehydrateDataRuntime(runtime) : undefined;
  if ((!data || Object.keys(data).length === 0) && (!queryCache || Object.keys(queryCache).length === 0)) {
    return '';
  }
  const payload = queryCache && Object.keys(queryCache).length
    ? { ...data, __askr_query_cache: queryCache }
    : data;
  return `<script type="application/json" ${SSR_RENDER_DATA_ATTR}="true">${JSON.stringify(
    payload
  )
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
}
