import type {
  RouteDestination,
  RouteParams,
  RouteRef,
  RouteSearch,
  RouteSearchValue,
} from '../common/router';
import { addRouteBasePath } from './base-path';

function routeParameterName(
  segment: string
): { name: string; splat: boolean } | null {
  if (segment === '*') return { name: '*', splat: true };
  if (!(segment.startsWith('{') && segment.endsWith('}'))) return null;
  const raw = segment.slice(1, -1).trim();
  return raw.startsWith('*')
    ? { name: raw.slice(1).trim(), splat: true }
    : { name: raw, splat: false };
}

function encodeParameter(value: string, splat: boolean): string {
  return splat
    ? value
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
    : encodeURIComponent(value);
}

function buildPath<TParams extends RouteParams>(
  route: RouteRef<TParams, unknown>,
  params: TParams
): string {
  return route.path
    .split('/')
    .map((segment) => {
      const parameter = routeParameterName(segment);
      if (!parameter) return segment;
      const value = params[parameter.name];
      if (value === undefined) {
        throw new Error(`Missing route parameter "${parameter.name}".`);
      }
      return encodeParameter(value, parameter.splat);
    })
    .join('/');
}

function appendSearchValue(
  query: URLSearchParams,
  key: string,
  value: RouteSearchValue
): void {
  if (value === undefined) return;
  if (Array.isArray(value)) {
    for (const entry of value) query.append(key, String(entry));
    return;
  }
  query.set(key, String(value));
}

function formatSearchIssues(
  issues: readonly {
    path: readonly (string | number)[];
    message: string;
  }[]
): string {
  return issues
    .map(
      (issue) =>
        `${issue.path.length ? issue.path.join('.') : 'search'}: ${issue.message}`
    )
    .join('; ');
}

export function to<
  TParams extends RouteParams,
  TSearch extends RouteSearch = RouteSearch,
>(
  route: RouteRef<TParams, TSearch>,
  params: TParams,
  search?: TSearch
): RouteDestination {
  const path = addRouteBasePath(buildPath(route, params), route.basePath ?? '');
  const parsedSearch = route.searchSchema?.safeParse(search ?? {});
  if (parsedSearch && !parsedSearch.success) {
    throw new Error(
      `Invalid route search. ${formatSearchIssues(parsedSearch.issues)}`
    );
  }

  const values = (parsedSearch?.success ? parsedSearch.data : search) as
    | RouteSearch
    | undefined;
  if (!values) return Object.freeze({ href: path });

  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    appendSearchValue(query, key, value);
  }
  const suffix = query.toString();
  return Object.freeze({ href: suffix ? `${path}?${suffix}` : path });
}
