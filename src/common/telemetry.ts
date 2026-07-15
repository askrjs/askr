export interface TelemetryFields {
  requestId?: string;
  traceId?: string;
  route?: string;
  action?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
}

export type TelemetrySpan = <T>(fields: TelemetryFields, work: () => T) => T;

/**
 * Structural subset implemented by `createTelemetry()` from `@askrjs/otel`.
 * Core does not install an OpenTelemetry SDK, backend, or exporter.
 */
export interface CoreTelemetry {
  routeMatch?: TelemetrySpan;
  loader?: TelemetrySpan;
  queryPrefetch?: TelemetrySpan;
  ssrRender?: TelemetrySpan;
}

export function withTelemetry<T>(
  span: TelemetrySpan | undefined,
  fields: TelemetryFields,
  work: () => T
): T {
  return span ? span(fields, work) : work();
}
