import type { RouteMatch } from './router';

export type RouteActivityMatch = Pick<RouteMatch, 'path'>;

type RouteActivitySnapshot = {
  path: string;
  matches: readonly RouteActivityMatch[];
};

let currentRouteActivity: RouteActivitySnapshot = {
  path: '/',
  matches: [],
};

function normalizeRouteActivityPath(path: string): string {
  const withoutHash = path.split('#', 1)[0] ?? '';
  const withoutSearch = withoutHash.split('?', 1)[0] ?? '';
  const pathname = withoutSearch || '/';
  const absolutePathname = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return absolutePathname.endsWith('/') && absolutePathname !== '/'
    ? absolutePathname.slice(0, -1)
    : absolutePathname;
}

function readActivePathname(): string {
  if (typeof window !== 'undefined' && window.location) {
    return window.location.pathname || '/';
  }

  return currentRouteActivity.path;
}

export function syncRouteActivitySnapshot(
  pathname: string,
  matches: readonly RouteActivityMatch[] = []
): void {
  currentRouteActivity = {
    path: normalizeRouteActivityPath(pathname),
    matches: Object.freeze([...matches]),
  };
}

export function isRouteActivityActive(
  pathOrPaths: string | readonly string[]
): boolean {
  const candidates = new Set(
    (Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths]).map(
      normalizeRouteActivityPath
    )
  );

  const activePath = normalizeRouteActivityPath(readActivePathname());
  if (candidates.has(activePath)) {
    return true;
  }

  return currentRouteActivity.matches.some((match) =>
    candidates.has(normalizeRouteActivityPath(match.path))
  );
}
