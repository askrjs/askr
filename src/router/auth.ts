import type { AuthContext } from '@askrjs/auth';
import type { RouteMode } from '../common/router';
import { getActiveRenderContext } from '../common/render-context';
import {
  withPageFramework,
  type PageRenderEnvelope,
} from '../common/page-render-envelope';

/** @internal Hydration envelope key for the app's opted-in auth snapshot. */
export const HYDRATED_AUTH = 'au';

const anonymous: AuthContext = Object.freeze({
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
});
let clientAuth: AuthContext = anonymous;
let hydratedAuth: AuthContext | undefined;

/** Return the identity resolved for the route currently being rendered. */
export function currentAuth(): AuthContext {
  // A server render sees only its own request's identity. Falling back to the
  // client identity here would expose whichever request resolved last.
  const render = getActiveRenderContext();
  if (render) return render.authContext ?? anonymous;
  return clientAuth;
}

/** @internal Updated atomically with route resolution. */
export function setCurrentAuth(context: AuthContext, mode: RouteMode): void {
  const render = getActiveRenderContext();
  if (render) {
    render.authContext = context;
    return;
  }
  // Server resolutions carry their identity on the resolved result; only the
  // browser keeps a process-wide identity.
  if (mode === 'spa') clientAuth = context;
}

/** @internal Drop the client identity. Part of the router-wide reset. */
export function resetClientAuth(): void {
  clientAuth = anonymous;
  hydratedAuth = undefined;
}

/**
 * @internal Read and validate the server's opted-in identity snapshot. It
 * decides the initial route the server already authorized and, when the app
 * configures no `resolve`, stays the client identity for navigations. It is
 * never a credential; the server enforces access.
 */
export function readHydratedAuth(
  envelope: PageRenderEnvelope | null
): AuthContext | undefined {
  hydratedAuth = undefined;
  const value = envelope?.framework[HYDRATED_AUTH] as
    | Partial<AuthContext>
    | undefined;
  if (value === undefined) return undefined;
  const { authenticated, principal, tenant, scopes } = value ?? {};
  if (
    typeof authenticated !== 'boolean' ||
    (principal !== null && typeof principal?.id !== 'string') ||
    (tenant !== null && typeof tenant !== 'string') ||
    (scopes !== undefined &&
      !(Array.isArray(scopes) && scopes.every((s) => typeof s === 'string')))
  ) {
    throw new TypeError('[Askr] Malformed hydration auth snapshot.');
  }
  return (hydratedAuth = Object.freeze({
    authenticated,
    principal,
    session: null,
    tenant,
    ...(scopes ? { scopes } : {}),
  }));
}

/** @internal The hydration envelope without the auth snapshot. */
export function withoutHydratedAuth(
  envelope: PageRenderEnvelope | null
): PageRenderEnvelope | null {
  if (!envelope || !(HYDRATED_AUTH in envelope.framework)) return envelope;
  const framework = { ...envelope.framework };
  delete framework[HYDRATED_AUTH];
  return withPageFramework(envelope, framework);
}

/** @internal Identity for a request when no `resolve` is configured. */
export function unresolvedAuth(mode: RouteMode): AuthContext {
  return (
    (mode === 'spa' && !getActiveRenderContext() && hydratedAuth) || anonymous
  );
}
