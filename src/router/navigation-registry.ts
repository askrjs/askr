import type { Route, RouteAuthOptions, RouteManifest } from '../common/router';
import { isProductionEnvironment } from '../common/env';
import type { ComponentInstance } from '../runtime/component';
import {
  computeRouteActivityMatches,
  lockRouteRegistration,
  syncCurrentRouteSnapshot,
} from './route';

export type AppNavigationSource = {
  manifest?: RouteManifest;
  routes?: readonly Route[];
  auth?: RouteAuthOptions;
};

export type AppRegistration = AppNavigationSource & {
  instance: ComponentInstance;
  pathname: string;
  href: string;
};

type NavigationRegistryHost = {
  cancelRouteRequests(): void;
};

let currentInstance: ComponentInstance | null = null;
let currentPathname = '/';
let currentHref = '/';
let navigationRegistryHost: NavigationRegistryHost | null = null;

const registeredApps: AppRegistration[] = [];

export function configureNavigationRegistryHost(
  host: NavigationRegistryHost
): void {
  navigationRegistryHost = host;
}

export function getCurrentPathname(): string {
  return currentPathname;
}

export function getCurrentHref(): string {
  return currentHref;
}

export function setCurrentRouteLocation(pathname: string, href: string): void {
  currentPathname = pathname;
  currentHref = href;
}

export function getWindowHref(): string {
  if (typeof window === 'undefined') {
    return currentHref;
  }

  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function parseTargetUrl(path: string): URL {
  const pathname = window.location.pathname || '/';
  const search = window.location.search || '';
  const hash = window.location.hash || '';
  const href =
    typeof window.location.href === 'string' ? window.location.href : '';
  const base =
    href &&
    href !== 'about:blank' &&
    !href.startsWith('about:') &&
    !href.startsWith('data:')
      ? href
      : `http://localhost${pathname}${search}${hash}`;

  return new URL(path, base);
}

export function getRegisteredAppsSnapshot(): AppRegistration[] {
  return [...registeredApps];
}

export function hasRegisteredApps(): boolean {
  return registeredApps.length > 0;
}

export function syncAppRegistrationLocation(
  app: AppRegistration,
  pathname: string,
  href: string
): void {
  app.pathname = pathname;
  app.href = href;
}

function collectRouteActivityMatches(
  pathname: string,
  apps: readonly AppRegistration[] = registeredApps
) {
  const matches: ReturnType<typeof computeRouteActivityMatches> = [];
  const seenPaths = new Set<string>();

  for (const app of apps) {
    const appMatches = computeRouteActivityMatches(pathname, {
      manifest: app.manifest,
      routes: app.routes,
    });

    for (const match of appMatches) {
      if (seenPaths.has(match.path)) {
        continue;
      }
      seenPaths.add(match.path);
      matches.push(match);
    }
  }

  return matches;
}

export function syncRegisteredRouteSnapshot(): void {
  if (typeof window === 'undefined') {
    return;
  }

  const pathname = window.location.pathname || '/';
  syncCurrentRouteSnapshot(
    pathname,
    window.location.search || '',
    window.location.hash || '',
    collectRouteActivityMatches(pathname)
  );
}

export function registerAppInstance(
  instance: ComponentInstance,
  path: string,
  source: AppNavigationSource = {}
): void {
  const existingIndex = registeredApps.findIndex(
    (app) => app.instance === instance
  );
  const registration: AppRegistration = {
    instance,
    pathname: path,
    href: getWindowHref(),
    ...source,
  };
  if (existingIndex >= 0) {
    registeredApps[existingIndex] = registration;
  } else {
    registeredApps.push(registration);
  }

  currentInstance = instance;
  currentPathname = path;
  currentHref = getWindowHref();
  syncRegisteredRouteSnapshot();
  if (isProductionEnvironment()) {
    lockRouteRegistration();
  }
}

export function unregisterAppInstance(instance: ComponentInstance): void {
  const existingIndex = registeredApps.findIndex(
    (app) => app.instance === instance
  );
  if (existingIndex >= 0) {
    registeredApps.splice(existingIndex, 1);
  }
  syncRegisteredRouteSnapshot();

  if (currentInstance !== instance) {
    return;
  }

  const nextApp =
    registeredApps.length > 0
      ? registeredApps[registeredApps.length - 1]!
      : null;
  currentInstance = nextApp?.instance ?? null;
  if (nextApp) {
    currentPathname = nextApp.pathname;
    currentHref = nextApp.href;
    syncRegisteredRouteSnapshot();
    return;
  }

  navigationRegistryHost?.cancelRouteRequests();
  currentPathname = '/';
  currentHref = '/';
  if (typeof window === 'undefined') {
    syncCurrentRouteSnapshot('/', '', '', []);
  }
}
