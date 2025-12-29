/**
 * Common call contracts: Router types
 */

export interface RouteHandler {
  (params: Record<string, string>, context?: { signal: AbortSignal }): unknown;
}

export interface Route {
  path: string;
  handler: RouteHandler;
  namespace?: string;
}

export interface ResolvedRoute {
  handler: RouteHandler;
  params: Record<string, string>;
}

export interface RouteMatch {
  path: string;
  params: Readonly<Record<string, string>>;
  name?: string;
  namespace?: string;
}

export interface RouteQuery {
  get(key: string): string | null;
  getAll(key: string): string[];
  has(key: string): boolean;
  toJSON(): Record<string, string | string[]>;
}

export interface RouteSnapshot {
  path: string;
  params: Readonly<Record<string, string>>;
  query: Readonly<RouteQuery>;
  hash: string | null;

  name?: string;
  namespace?: string;
  matches: readonly RouteMatch[];
}
