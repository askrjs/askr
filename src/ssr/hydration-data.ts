import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import type { SSRData } from './context';
import type { DataRuntime } from '../data/types';
import { dehydrateDataRuntime } from '../data/query-registry';
import { isDeferred } from '../router/deferred';
import {
  createPageRenderEnvelope,
  isEmptyPageRenderEnvelope,
  isPageRenderEnvelope,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';
import {
  getRouteHydrationMetadata,
  validateRouteHydrationData,
} from '../router/route-hydration';

const DEFERRED_PAYLOAD = '__askr_deferred__';

function hydrationReplacer(_key: string, value: unknown): unknown {
  if (!isDeferred(value)) return value;
  if (value.state === 'fulfilled') {
    return { [DEFERRED_PAYLOAD]: 'fulfilled', value: value.value };
  }
  if (value.state === 'rejected') {
    return {
      [DEFERRED_PAYLOAD]: 'rejected',
      error:
        value.error instanceof Error
          ? value.error.message
          : String(value.error),
    };
  }
  return { [DEFERRED_PAYLOAD]: 'pending' };
}

export function serializeHydrationRenderData(
  data: SSRData | PageRenderEnvelope | undefined,
  runtime?: DataRuntime
): string {
  const queryCache = runtime ? dehydrateDataRuntime(runtime) : undefined;
  const current = isPageRenderEnvelope(data)
    ? data
    : createPageRenderEnvelope({ resources: data });
  const payload = createPageRenderEnvelope({
    resources: { ...current.resources, ...queryCache },
    route: current.route,
    framework: current.framework,
  });
  const routeHydration = getRouteHydrationMetadata(payload.framework);
  if (routeHydration) {
    validateRouteHydrationData(payload.route, routeHydration.r);
  }
  if (isEmptyPageRenderEnvelope(payload)) return '';
  return `<script type="application/json" ${SSR_RENDER_DATA_ATTR}="true">${JSON.stringify(
    payload,
    hydrationReplacer
  )
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
}
