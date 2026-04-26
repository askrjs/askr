import { withRouteAuthOptions } from './policy';

import type {
  RouteAuthOptions,
  RouteContext,
  RouteQuery,
} from '../common/router';

export function parseLocation(url: string): {
  pathname: string;
  search: string;
  hash: string;
} {
  try {
    const parsedUrl = new URL(url, 'http://localhost');
    return {
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
    };
  } catch {
    return { pathname: '/', search: '', hash: '' };
  }
}

export function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
    Object.freeze(obj as Record<string, unknown>);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value && typeof value === 'object') {
        deepFreeze(value);
      }
    }
  }

  return obj;
}

export function makeQuery(search: string): RouteQuery {
  const searchParams = new URLSearchParams(search || '');
  const mapping = new Map<string, string[]>();

  for (const [key, value] of searchParams.entries()) {
    const existing = mapping.get(key);
    if (existing) {
      existing.push(value);
    } else {
      mapping.set(key, [value]);
    }
  }

  const query: RouteQuery = {
    get(key: string) {
      const values = mapping.get(key);
      return values ? values[0] : null;
    },
    getAll(key: string) {
      const values = mapping.get(key);
      return values ? [...values] : [];
    },
    has(key: string) {
      return mapping.has(key);
    },
    toJSON() {
      const output: Record<string, string | string[]> = {};
      for (const [key, values] of mapping.entries()) {
        output[key] = values.length > 1 ? [...values] : values[0];
      }
      return output;
    },
  };

  return deepFreeze(query);
}

export function buildRouteContextBase(
  target: string,
  params: Record<string, string>,
  options: {
    mode: RouteContext['mode'];
    signal: AbortSignal;
  }
): Omit<RouteContext, 'session' | 'user'> {
  const parsed = parseLocation(target);
  const href = `${parsed.pathname}${parsed.search}${parsed.hash}`;

  return {
    mode: options.mode,
    params,
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
    href,
    signal: options.signal,
  };
}

export function buildRouteContext(
  target: string,
  params: Record<string, string>,
  options: {
    mode: RouteContext['mode'];
    signal: AbortSignal;
    auth?: RouteAuthOptions;
    session?: unknown;
    user?: unknown;
  }
): RouteContext {
  const context: RouteContext = {
    ...buildRouteContextBase(target, params, options),
    session: options.session ?? null,
    user: options.user ?? null,
  };

  return withRouteAuthOptions(context, options.auth);
}
