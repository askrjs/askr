import type { JSXElement } from '../common/jsx';
import {
  renderRouteToStream,
  renderRouteToString,
  resolveRequest,
  type RouteRenderHost,
  type RouteRenderOptions,
  type RouteStreamOptions,
} from './route-render';
import { renderSSRRouteAppToSink, renderToStringSync } from './render-sync';
import type { VNode } from './types';

export { SSRDataMissingError } from './context';
export type {
  DocumentRenderArgs,
  DocumentRenderContext,
  DocumentRenderer,
  SSRStyleRegistrationValidation,
  SSRStyleRegistration,
} from '../common/ssr';
export type { SSRRoute } from './route-render';
export type { VNode, SSRComponent } from './types';
export { renderResolvedToStringSync } from './render-resolved';
export {
  renderRouteRequest,
  renderRouteRequestToString,
} from './route-request-render';
export type {
  RenderRouteRequestOptions,
  RenderRouteRequestResult,
} from './route-request-render';
export { renderToStringSync, resolveRequest };

const routeRenderHost: RouteRenderHost = {
  renderAppToSink: renderSSRRouteAppToSink,
};

export function renderToString(
  component: (
    props?: Record<string, unknown>
  ) => VNode | JSXElement | string | number | null
): string;
export function renderToString(opts: RouteRenderOptions): string;
export function renderToString(arg: unknown): string {
  if (typeof arg === 'function') {
    return renderToStringSync(
      arg as (
        props?: Record<string, unknown>
      ) => VNode | JSXElement | string | number | null
    );
  }
  const opts = arg as RouteRenderOptions;
  return renderRouteToString(opts, routeRenderHost);
}

export function renderToStream(opts: RouteStreamOptions): void {
  renderRouteToStream(opts, routeRenderHost);
}
