import type {
  ParsedSegment,
  RouteRegistry,
  RouteMatch,
  RouteRecord,
} from '../common/router';
import { computeRouteActivityMatches } from '../router/testing';

interface MatchRouteOptions {
  registry: RouteRegistry;
}

/** A splat-route/static-route path collision reported by {@link getRouteWarnings}. */
export interface RoutePatternWarning {
  kind: 'route-collision';
  path: string;
  conflictingPath: string;
  segment: string;
  namespace: string | undefined;
  message: string;
}

/** Match `path` against a route registry for tests, without mounting the app. */
export function matchRoute(
  path: string,
  options: MatchRouteOptions
): RouteMatch | null {
  if (!options?.registry) {
    throw new TypeError('matchRoute requires options.registry.');
  }

  return (
    computeRouteActivityMatches(path, {
      registry: options.registry,
    })[0] ?? null
  );
}

type RoutePatternRecord = {
  path: string;
  segments: ParsedSegment[];
  namespace: string | undefined;
};

function getRoutePatternRecords(
  options: MatchRouteOptions
): RoutePatternRecord[] {
  if (!options?.registry) {
    throw new TypeError('getRouteWarnings requires options.registry.');
  }

  return options.registry.manifest.records.map((record: RouteRecord) => ({
    path: record.path,
    segments: record.segments,
    namespace: record.options.namespace,
  }));
}

function routePrefixMatches(
  splatPrefix: readonly ParsedSegment[],
  routeSegments: readonly ParsedSegment[]
): boolean {
  if (routeSegments.length <= splatPrefix.length) {
    return false;
  }

  for (let index = 0; index < splatPrefix.length; index++) {
    const splatSegment = splatPrefix[index];
    const routeSegment = routeSegments[index];

    if (
      splatSegment.kind === 'static' &&
      routeSegment.kind === 'static' &&
      splatSegment.value !== routeSegment.value
    ) {
      return false;
    }
  }

  return true;
}

/** Find named-splat routes whose reserved segments collide with sibling static routes. */
export function getRouteWarnings(
  options: MatchRouteOptions
): RoutePatternWarning[] {
  const records = getRoutePatternRecords(options);
  const warnings: RoutePatternWarning[] = [];

  for (const record of records) {
    const splatIndex = record.segments.findIndex(
      (segment) => segment.kind === 'splat'
    );
    if (splatIndex === -1) {
      continue;
    }

    const splatPrefix = record.segments.slice(0, splatIndex);
    for (const candidate of records) {
      if (
        candidate === record ||
        candidate.namespace !== record.namespace ||
        !routePrefixMatches(splatPrefix, candidate.segments)
      ) {
        continue;
      }

      const reservedSegment = candidate.segments[splatIndex];
      if (reservedSegment?.kind !== 'static') {
        continue;
      }

      warnings.push({
        kind: 'route-collision',
        path: record.path,
        conflictingPath: candidate.path,
        segment: reservedSegment.value,
        namespace: record.namespace,
        message: `Route "${candidate.path}" reserves segment "${reservedSegment.value}" under named splat route "${record.path}".`,
      });
    }
  }

  return warnings.sort((left, right) => {
    const pathOrder = left.path.localeCompare(right.path);
    if (pathOrder !== 0) {
      return pathOrder;
    }
    return left.conflictingPath.localeCompare(right.conflictingPath);
  });
}
