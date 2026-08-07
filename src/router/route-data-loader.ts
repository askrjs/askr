import type { RouteContext } from '../common/router';

export type RouteDataLoadPhase = 'client' | 'server' | 'ssg';

export class RouteDataLoadError extends Error {
  readonly route: string;
  readonly phase: RouteDataLoadPhase;
  readonly cause: unknown;

  constructor(route: string, phase: RouteDataLoadPhase, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(
      '[Askr] Route data loader failed for "' +
        route +
        '" during ' +
        phase +
        ' loading: ' +
        detail
    );
    this.name = 'RouteDataLoadError';
    this.route = route;
    this.phase = phase;
    this.cause = cause;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

function loadPhase(mode: RouteContext['mode']): RouteDataLoadPhase {
  if (mode === 'spa') return 'client';
  if (mode === 'ssg') return 'ssg';
  return 'server';
}

/** @internal Add route context to failures from lazyRouteData(). */
export function _wrapRouteDataLoadError(
  error: unknown,
  context: RouteContext
): never {
  if (error instanceof RouteDataLoadError || isAbortError(error)) throw error;
  throw new RouteDataLoadError(
    context.href || context.pathname,
    loadPhase(context.mode),
    error
  );
}
