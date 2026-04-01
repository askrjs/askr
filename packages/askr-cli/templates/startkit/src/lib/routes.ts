export type AppRouteKind = 'public' | 'auth' | 'protected';

export type AppRouteDefinition = {
  id: 'landing' | 'login' | 'dashboard' | 'accounts' | 'settings';
  href: string;
  label: string;
  navLabel: string;
  description: string;
  kind: AppRouteKind;
};

const appOrigin = 'https://{{appName}}.local';

export const landingRoute: AppRouteDefinition = {
  id: 'landing',
  href: '/',
  label: 'Home',
  navLabel: 'Home',
  description: 'Marketing overview and entry points into the starter app.',
  kind: 'public',
};

export const loginRoute: AppRouteDefinition = {
  id: 'login',
  href: '/login',
  label: 'Login',
  navLabel: 'Sign in',
  description: 'Auth entry for the starter app.',
  kind: 'auth',
};

export const dashboardRoute: AppRouteDefinition = {
  id: 'dashboard',
  href: '/dashboard',
  label: 'Dashboard',
  navLabel: 'Dashboard',
  description: 'Overview of growth, usage, and recent workspace activity.',
  kind: 'protected',
};

export const accountsRoute: AppRouteDefinition = {
  id: 'accounts',
  href: '/accounts',
  label: 'Accounts',
  navLabel: 'Accounts',
  description: 'Search, filter, and manage account records.',
  kind: 'protected',
};

export const settingsRoute: AppRouteDefinition = {
  id: 'settings',
  href: '/settings',
  label: 'Settings',
  navLabel: 'Settings',
  description: 'Profile fields, preferences, and modal patterns.',
  kind: 'protected',
};

export const defaultProtectedRoute = dashboardRoute;
export const protectedRoutes = [
  dashboardRoute,
  accountsRoute,
  settingsRoute,
] as const;
export const workspaceRoutes = [...protectedRoutes] as const;
export const routeCatalog = [
  landingRoute,
  loginRoute,
  ...protectedRoutes,
] as const;

const routeByPath = new Map(routeCatalog.map((route) => [route.href, route]));

function parseRouteTarget(target: string): URL | null {
  try {
    return new URL(target, appOrigin);
  } catch {
    return null;
  }
}

export function isProtectedRoute(pathname: string): boolean {
  return protectedRoutes.some((route) => route.href === pathname);
}

export function normalizeProtectedRouteTarget(
  target: string | null | undefined
): string {
  if (!target) {
    return defaultProtectedRoute.href;
  }

  const parsed = parseRouteTarget(target);
  if (
    !parsed ||
    parsed.origin !== appOrigin ||
    !isProtectedRoute(parsed.pathname)
  ) {
    return defaultProtectedRoute.href;
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

export function buildLoginHref(nextTarget?: string | null): string {
  if (!nextTarget) {
    return loginRoute.href;
  }

  const target = normalizeProtectedRouteTarget(nextTarget);
  return `${loginRoute.href}?next=${encodeURIComponent(target)}`;
}

export function getRouteLabel(pathname: string): string {
  return routeByPath.get(pathname)?.label ?? 'Workspace';
}
