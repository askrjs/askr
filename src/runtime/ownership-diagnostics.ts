import { getDevNamespace } from './dev-namespace';

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

export type OwnershipDiagnosticKey =
  | 'routeGenerations'
  | 'readableReaders'
  | 'queryOwners'
  | 'queryCells'
  | 'timers'
  | 'resources'
  | 'streams'
  | 'portals'
  | 'queuedSchedulerWork';

export type OwnershipDiagnostics = Record<OwnershipDiagnosticKey, number>;

const DIAGNOSTICS_KEY = '__OWNERSHIP_DIAGNOSTICS';
const EMPTY_DIAGNOSTICS: OwnershipDiagnostics = {
  routeGenerations: 0,
  readableReaders: 0,
  queryOwners: 0,
  queryCells: 0,
  timers: 0,
  resources: 0,
  streams: 0,
  portals: 0,
  queuedSchedulerWork: 0,
};

const trackedRouteGenerations = new WeakSet<object>();
const portalRegistrations = new WeakMap<object, number>();

function isObjectIdentity(value: unknown): value is object {
  return (
    (typeof value === 'object' && value !== null) || typeof value === 'function'
  );
}

function getLiveDiagnostics(): OwnershipDiagnostics {
  const namespace = getDevNamespace();
  let diagnostics = namespace[DIAGNOSTICS_KEY] as
    | OwnershipDiagnostics
    | undefined;
  if (!diagnostics) {
    diagnostics = { ...EMPTY_DIAGNOSTICS };
    namespace[DIAGNOSTICS_KEY] = diagnostics;
  }
  return diagnostics;
}

export function adjustOwnershipDiagnostic(
  key: OwnershipDiagnosticKey,
  delta: number
): void {
  if (!__ASKR_DEVELOPMENT_BUILD__) {
    return;
  }

  const diagnostics = getLiveDiagnostics();
  diagnostics[key] = Math.max(0, diagnostics[key] + delta);
}

export function setOwnershipDiagnostic(
  key: OwnershipDiagnosticKey,
  value: number
): void {
  if (!__ASKR_DEVELOPMENT_BUILD__) {
    return;
  }

  getLiveDiagnostics()[key] = Math.max(0, value);
}

export function trackRouteGeneration(generation: unknown): void {
  if (
    !__ASKR_DEVELOPMENT_BUILD__ ||
    !isObjectIdentity(generation) ||
    trackedRouteGenerations.has(generation)
  ) {
    return;
  }

  trackedRouteGenerations.add(generation);
  adjustOwnershipDiagnostic('routeGenerations', 1);
}

export function untrackRouteGeneration(generation: unknown): void {
  if (
    !__ASKR_DEVELOPMENT_BUILD__ ||
    !isObjectIdentity(generation) ||
    !trackedRouteGenerations.delete(generation)
  ) {
    return;
  }

  adjustOwnershipDiagnostic('routeGenerations', -1);
}

export function adjustPortalRegistrations(owner: object, delta: number): void {
  if (!__ASKR_DEVELOPMENT_BUILD__) {
    return;
  }

  const previous = portalRegistrations.get(owner) ?? 0;
  const next = Math.max(0, previous + delta);
  if (next === 0) {
    portalRegistrations.delete(owner);
  } else {
    portalRegistrations.set(owner, next);
  }
  adjustOwnershipDiagnostic('portals', next - previous);
}

export function clearPortalRegistrations(owner: object): void {
  if (!__ASKR_DEVELOPMENT_BUILD__) {
    return;
  }

  const count = portalRegistrations.get(owner) ?? 0;
  if (count === 0) {
    return;
  }
  portalRegistrations.delete(owner);
  adjustOwnershipDiagnostic('portals', -count);
}

/** @internal Test and benchmark diagnostic snapshot. */
export function getOwnershipDiagnostics(): OwnershipDiagnostics {
  if (!__ASKR_DEVELOPMENT_BUILD__) {
    return { ...EMPTY_DIAGNOSTICS };
  }

  return { ...getLiveDiagnostics() };
}
