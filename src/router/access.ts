import type {
  GroupHelperOptions,
  RouteOptions,
  RoutePolicy,
} from '../common/router';
import {
  requireAuth,
  requireGuest,
  requirePermission,
  requireRole,
} from './policy';
import type { AccessScopeState } from './internal-types';

function hasBuiltInAuthMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>
): boolean {
  return node.auth !== undefined || !!node.role || !!node.permission;
}

function validateSameNodeAccessMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>
): void {
  if (node.auth === 'guest' && (!!node.role || !!node.permission)) {
    throw new Error(
      'Guest-only routes cannot be combined with role or permission requirements.'
    );
  }
}

export function validateAccessMetadata(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>,
  context: {
    authConfigured: boolean;
    state: AccessScopeState;
  }
): void {
  validateSameNodeAccessMetadata(node);

  const requiresAuthenticated =
    node.auth === true || !!node.role || !!node.permission;

  if (
    node.auth === 'guest' &&
    (context.state.authenticated || !!node.role || !!node.permission)
  ) {
    throw new Error(
      'Guest-only routes cannot be combined with authenticated access requirements.'
    );
  }

  if (context.state.guestOnly && requiresAuthenticated) {
    throw new Error(
      'Child routes cannot weaken a guest-only access scope with authenticated requirements.'
    );
  }

  if (hasBuiltInAuthMetadata(node) && !context.authConfigured) {
    throw new Error(
      'Routes using `auth`, `role`, or `permission` require `auth.resolve` in registerRoutes(...).'
    );
  }
}

export function nextAccessScopeState(
  node: Pick<GroupHelperOptions | RouteOptions, 'auth' | 'role' | 'permission'>,
  state: AccessScopeState
): AccessScopeState {
  const requiresAuthenticated =
    node.auth === true || !!node.role || !!node.permission;

  return {
    guestOnly: state.guestOnly || node.auth === 'guest',
    authenticated: state.authenticated || requiresAuthenticated,
  };
}

export function compileNodePolicies(
  node: Pick<
    RouteOptions | GroupHelperOptions,
    'auth' | 'role' | 'permission' | 'policies'
  >
): RoutePolicy[] {
  validateSameNodeAccessMetadata(node);

  const compiled: RoutePolicy[] = [];

  if (node.auth === true) {
    compiled.push(requireAuth());
  } else if (node.auth === 'guest') {
    compiled.push(requireGuest());
  }

  if (node.role) {
    compiled.push(requireRole(node.role));
  }

  if (node.permission) {
    compiled.push(requirePermission(node.permission));
  }

  if (node.policies?.length) {
    compiled.push(...node.policies);
  }

  return compiled;
}
