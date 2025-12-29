/**
 * Internal shared call contracts.
 *
 * Not part of the public root API; used to decouple internal modules.
 */

export type { Props, ComponentNode } from './props';
export { ELEMENT_TYPE, Fragment } from './jsx';
export type { JSXElement } from './jsx';
export type { VNode, DOMElement } from './vnode';
export { _isDOMElement } from './vnode';
export type { ComponentFunction, ComponentContext } from './component';
export type {
  Route,
  RouteHandler,
  ResolvedRoute,
  RouteMatch,
  RouteQuery,
  RouteSnapshot,
} from './router';
export type { SSRData, SSRContext, RenderContext } from './ssr';
