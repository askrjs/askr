import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { action } from './actions.js';

interface TelemetryFields {
  requestId?: string;
  traceId?: string;
  route?: string;
  action?: string;
  operation?: string;
  status?: number;
  durationMs?: number;
}

type TelemetrySpan = <T>(fields: TelemetryFields, work: () => T) => T;

/**
 * Structural subset implemented by `createTelemetry()` from `@askrjs/otel`.
 * Core does not install an OpenTelemetry SDK, backend, or exporter.
 */
interface CoreTelemetry {
  routeMatch?: TelemetrySpan;
  loader?: TelemetrySpan;
  queryPrefetch?: TelemetrySpan;
  ssrRender?: TelemetrySpan;
}
export { TelemetryFields, TelemetrySpan, CoreTelemetry };
