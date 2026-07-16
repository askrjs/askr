import type { AuthContext } from '@askrjs/auth';
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
  return getActiveRenderContext()?.authContext ?? clientAuth;
}

/** @internal Updated atomically with route resolution. */
export function setCurrentAuth(context: AuthContext): void {
  clientAuth = context;
  const render = getActiveRenderContext();
  if (render) render.authContext = context;
}
