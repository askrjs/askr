import { SSR_RENDER_DATA_ATTR } from '../common/ssr';
import type { SSRData } from './context';
import type { DataRuntime } from '../data/types';
import { dehydrateDataRuntime } from '../data/query-registry';
import { isDeferred } from '../common/deferred-value';
import type { AuthContext } from '@askrjs/auth';
import type { RouteAuthOptions } from '../common/router';
import { HYDRATED_AUTH } from '../router/auth';
import {
  createPageRenderEnvelope,
  withPageFramework,
  isEmptyPageRenderEnvelope,
  isPageRenderEnvelope,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';
import {
  getRouteHydrationMetadata,
  validateRouteHydrationData,
} from '../router/route-hydration';

const DEFERRED_PAYLOAD = '__askr_deferred__';

/** Client-visible reason for a rejected deferred value that did not opt in to exposure. */
export const REDACTED_DEFERRED_ERROR = 'Deferred value rejected.';

/**
 * Rejection reasons reach the page only when the error opts in with
 * `expose: true`. Anything else can carry server internals (connection
 * strings, hosts, SQL) into public HTML.
 */
function exposedDeferredError(error: unknown): string {
  return error instanceof Error &&
    (error as Error & { expose?: unknown }).expose === true
    ? error.message
    : REDACTED_DEFERRED_ERROR;
}

function hydrationReplacer(value: unknown): unknown {
  if (!isDeferred(value)) return value;
  if (value.state === 'fulfilled') {
    return { [DEFERRED_PAYLOAD]: 'fulfilled', value: value.value };
  }
  if (value.state === 'rejected') {
    return {
      [DEFERRED_PAYLOAD]: 'rejected',
      error: exposedDeferredError(value.error),
    };
  }
  return { [DEFERRED_PAYLOAD]: 'pending' };
}

/**
 * Add the app's opted-in identity projection to a hydration envelope. Without
 * `auth.dehydrate`, nothing about the identity reaches the page. The session is
 * never sent; `authenticated`, `principal`, `tenant`, and `scopes` are sent
 * verbatim.
 */
export function withHydratedAuth(
  envelope: PageRenderEnvelope,
  options: RouteAuthOptions | undefined,
  context: AuthContext | undefined
): PageRenderEnvelope {
  if (!options?.dehydrate || !context) return envelope;
  const { authenticated, principal, tenant, scopes } =
    options.dehydrate(context);
  return withPageFramework(envelope, {
    ...envelope.framework,
    [HYDRATED_AUTH]: {
      authenticated,
      principal,
      tenant,
      ...(scopes ? { scopes } : {}),
    },
  });
}

export function serializeHydrationRenderData(
  data: SSRData | PageRenderEnvelope | undefined,
  runtime?: DataRuntime
): string {
  const queryCache = runtime ? dehydrateDataRuntime(runtime) : undefined;
  const current = isPageRenderEnvelope(data)
    ? data
    : createPageRenderEnvelope({ resources: data });
  const queries = { ...current.queries, ...queryCache };
  const payload = createPageRenderEnvelope({
    resources: current.resources,
    queries: Object.keys(queries).length > 0 ? queries : undefined,
    route: current.route,
    framework: current.framework,
  });
  const routeHydration = getRouteHydrationMetadata(payload.framework);
  if (routeHydration) {
    validateRouteHydrationData(payload.route, routeHydration.r);
  }
  if (isEmptyPageRenderEnvelope(payload)) return '';
  // Tag actual deferred locations outside user data. The marker-shaped
  // records remain readable by older clients, while new clients can tell
  // them apart from ordinary loader/resource values with the same keys.
  const deferredPaths: string[][] = [];
  const paths = new WeakMap<object, string[]>();
  let hasDeferredMarker = false;
  return `<script type="application/json" ${SSR_RENDER_DATA_ATTR}="true">${JSON.stringify(
    {
      ...payload,
      // Read last, after the payload walk. Preserve existing bytes when the
      // page has neither a deferred value nor a marker-shaped user record.
      get deferredPaths() {
        return deferredPaths.length > 0 || hasDeferredMarker
          ? deferredPaths
          : undefined;
      },
    },
    function (this: object, key: string, value: unknown): unknown {
      if (
        key === DEFERRED_PAYLOAD &&
        (value === 'fulfilled' || value === 'rejected')
      ) {
        hasDeferredMarker = true;
      }
      const parentPath = paths.get(this);
      const path = parentPath ? [...parentPath, key] : [];
      if (isDeferred(value)) deferredPaths.push(path);
      const encoded = hydrationReplacer(value);
      if (encoded && typeof encoded === 'object') paths.set(encoded, path);
      return encoded;
    }
  )
    .replace(/</g, '\\u003C')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')}</script>`;
}
