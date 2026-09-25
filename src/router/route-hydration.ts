import type { RouteContext, RouteOptions } from '../common/router';
import { isPromiseLike } from '../common/promise';
import { isDeferred } from '../common/deferred-value';
import {
  jsonTransportPropertyPath,
  validateJsonTransportValue,
} from '../common/json-transport';

type DeferredHydrationValue = {
  readonly state: 'pending' | 'fulfilled' | 'rejected';
  readonly value?: unknown;
};

function isDeferredHydrationValue(
  value: unknown
): value is DeferredHydrationValue {
  return isDeferred(value);
}

/** Compact, framework-owned route hydration metadata key. */
export const ROUTE_HYDRATION_METADATA = 'rh';

export interface RouteOmissionMap {
  readonly [key: string]: 1 | RouteOmissionMap;
}

export interface RouteHydrationMetadata {
  /** Concrete pathname or href used for actionable diagnostics. */
  readonly r: string;
  /** Branches present in the server value but omitted by dehydrate(). */
  readonly o?: RouteOmissionMap;
}

export interface PreparedRouteHydrationData {
  readonly data: unknown;
  readonly metadata: RouteHydrationMetadata;
}

const omissionGuards = new WeakMap<object, WeakMap<RouteOmissionMap, object>>();

const propertyPath = jsonTransportPropertyPath;

/** Validate the exact value that will enter the route hydration envelope. */
export function validateRouteHydrationData(
  value: unknown,
  route: string
): void {
  validateJsonTransportValue(value, (path, reason) => {
    throw new TypeError(
      `[Askr] Route hydration data for "${route}" at "${path}" is not JSON transport-safe: ${reason}. ` +
        'Return JSON-compatible data or use route(..., { dehydrate(data) { ... } }) to omit server-only values.'
    );
  });
}

function omissionMap(
  complete: unknown,
  selected: unknown,
  ancestors = new Set<object>()
): RouteOmissionMap | undefined {
  if (
    !complete ||
    typeof complete !== 'object' ||
    isDeferredHydrationValue(complete)
  )
    return undefined;
  if (ancestors.has(complete)) return undefined;
  ancestors.add(complete);

  const selectedObject =
    selected && typeof selected === 'object' ? selected : undefined;
  const output: Record<string, 1 | RouteOmissionMap> = Object.create(null);

  try {
    for (const key of Object.keys(complete)) {
      if (
        !selectedObject ||
        !Object.prototype.hasOwnProperty.call(selectedObject, key)
      ) {
        output[key] = 1;
        continue;
      }
      const completeDescriptor = Object.getOwnPropertyDescriptor(complete, key);
      const selectedDescriptor = Object.getOwnPropertyDescriptor(
        selectedObject,
        key
      );
      if (!completeDescriptor || !selectedDescriptor) continue;
      if (!('value' in completeDescriptor) || !('value' in selectedDescriptor))
        continue;
      const nested = omissionMap(
        completeDescriptor.value,
        selectedDescriptor.value,
        ancestors
      );
      if (nested) output[key] = nested;
    }
  } finally {
    ancestors.delete(complete);
  }

  return Object.keys(output).length > 0 ? Object.freeze(output) : undefined;
}

export function prepareRouteHydrationData(
  complete: unknown,
  dehydrate: RouteOptions['dehydrate'] | undefined,
  context: RouteContext & { request?: Request },
  route = context.href || context.pathname
): PreparedRouteHydrationData {
  const selected = dehydrate ? dehydrate(complete, context) : complete;
  if (isPromiseLike(selected)) {
    throw new TypeError(
      `[Askr] Route dehydrate() for "${route}" returned a Promise. ` +
        'dehydrate(data, context) must be synchronous.'
    );
  }
  validateRouteHydrationData(selected, route);
  return {
    data: selected,
    metadata: Object.freeze({
      r: route,
      ...(dehydrate ? { o: omissionMap(complete, selected) } : {}),
    }),
  };
}

function readMetadata(
  framework: Readonly<Record<string, unknown>>
): RouteHydrationMetadata | undefined {
  const value = framework[ROUTE_HYDRATION_METADATA];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const metadata = value as Partial<RouteHydrationMetadata>;
  return typeof metadata.r === 'string'
    ? (metadata as RouteHydrationMetadata)
    : undefined;
}

function omittedRead(route: string, path: string): never {
  throw new Error(
    `[Askr] routeData() read "${path}" on the initial hydration of "${route}", ` +
      'but that branch was intentionally omitted by dehydrate(). Keep initial hydrated rendering within the selected data, or wait for a client navigation that reruns the loader with the complete result.'
  );
}

function guardOmissions(
  value: unknown,
  omissions: RouteOmissionMap | undefined,
  route: string,
  path = '$'
): unknown {
  if (
    !omissions ||
    !value ||
    typeof value !== 'object' ||
    isDeferredHydrationValue(value)
  )
    return value;
  let guards = omissionGuards.get(value);
  if (!guards) {
    guards = new WeakMap();
    omissionGuards.set(value, guards);
  }
  const cached = guards.get(omissions);
  if (cached) return cached;

  const guarded = new Proxy(value, {
    get(target, property, receiver) {
      if (typeof property === 'string') {
        const omitted = omissions[property];
        if (
          omitted &&
          !Object.prototype.hasOwnProperty.call(target, property)
        ) {
          omittedRead(route, propertyPath(path, property));
        }
        const child = Reflect.get(target, property, receiver);
        return omitted === 1
          ? child
          : guardOmissions(child, omitted, route, propertyPath(path, property));
      }
      return Reflect.get(target, property, receiver);
    },
  });
  guards.set(omissions, guarded);
  return guarded;
}

export function guardHydratedRouteData(
  value: unknown,
  framework: Readonly<Record<string, unknown>>
): unknown {
  const metadata = readMetadata(framework);
  return metadata ? guardOmissions(value, metadata.o, metadata.r) : value;
}

export function getRouteHydrationMetadata(
  framework: Readonly<Record<string, unknown>>
): RouteHydrationMetadata | undefined {
  return readMetadata(framework);
}

/** @internal Remove initial-only omission guards after a client loader reruns. */
export function withoutRouteHydrationMetadata(
  framework: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> | undefined {
  if (!framework || !(ROUTE_HYDRATION_METADATA in framework)) return framework;
  const next = { ...framework };
  delete next[ROUTE_HYDRATION_METADATA];
  return next;
}
