import type { AuthContext } from '@askrjs/auth';
import type { RouteAuthOptions } from '../common/router';

export interface SessionRecovery {
  readonly href: string;
  readonly document: boolean;
}

/** Private boot/router bridge. Only the factory's exact configuration opts in. */
export interface SessionAuthState {
  read(): AuthContext | undefined;
  capture(): () => void;
  adopt(context: AuthContext): boolean;
  attach(
    root: object,
    retire: () => void,
    mounted?: boolean
  ): (preserveIdentity?: boolean) => void;
  hasMountedRoots(): boolean;
  isDocumentRecovery(): boolean;
  recover(failure: unknown, returnTo: string): SessionRecovery | undefined;
}

const states = new WeakMap<RouteAuthOptions, SessionAuthState>();
const invalidatedRoots = new WeakSet<object>();

export function markSessionRootInvalidated(root: object): void {
  invalidatedRoots.add(root);
}

export function isSessionRootInvalidated(root: object): boolean {
  return invalidatedRoots.has(root);
}

export function clearSessionRootInvalidated(root: object): void {
  invalidatedRoots.delete(root);
}

export function registerSessionAuthState(
  options: RouteAuthOptions,
  state: SessionAuthState
): void {
  states.set(options, state);
}

export function getSessionAuthState(
  options: RouteAuthOptions | undefined
): SessionAuthState | undefined {
  return options ? states.get(options) : undefined;
}
