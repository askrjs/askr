import type { AuthContext } from '@askrjs/auth';
import type { RouteMode } from '../common/router';
import { getActiveRenderContext } from '../common/render-context';

const anonymous: AuthContext = Object.freeze({
  authenticated: false,
  principal: null,
  session: null,
  tenant: null,
});
let clientAuth: AuthContext = anonymous;

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
}
