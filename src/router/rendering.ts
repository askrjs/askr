import { ELEMENT_TYPE, Fragment, type JSXElement } from '../common/jsx';
import type {
  LayoutScopeRecord,
  PageScopeRecord,
  RouteComponent,
  RouteHandler,
  RouteRecord,
} from '../common/router';
import { ROUTE_ROOT_COMPONENT } from '../common/router-internal';
import type { RenderableChild } from '../common/vnode';
import { defineScope, readScope } from '../runtime';
import type { InternalRouteRecord } from './internal-types';
import { _associateLazyHandler } from './lazy';

const outletScope = defineScope<RenderableChild>(null);

export function Outlet(): JSXElement {
  return {
    $$typeof: ELEMENT_TYPE,
    type: Fragment,
    props: { children: readScope(outletScope) },
    key: null,
  };
}

function applyPageChain(
  pageChain: readonly PageScopeRecord[],
  params: Record<string, string>,
  content: RenderableChild,
  deferComponents = false
): RenderableChild {
  let nextContent = content;

  for (let i = pageChain.length - 1; i >= 0; i--) {
    nextContent = outletScope({
      value: nextContent,
      children: deferComponents
        ? createRouteComponentVNode(pageChain[i].component, params)
        : pageChain[i].component(params),
    });
  }

  return nextContent;
}

function createRouteComponentVNode(
  component: RouteComponent,
  params: Record<string, string>,
  routeRoot = false
): RenderableChild {
  return {
    $$typeof: ELEMENT_TYPE,
    type: component,
    props: params,
    key: null,
    ...(routeRoot ? { [ROUTE_ROOT_COMPONENT]: true } : {}),
  };
}

export function createRouteHandler(
  component: RouteComponent,
  pageChain: readonly PageScopeRecord[],
  layoutChain: readonly LayoutScopeRecord[],
  deferComponents = false
): RouteHandler {
  const handler: RouteHandler = (params) => {
    let content = deferComponents
      ? createRouteComponentVNode(component, params, true)
      : component(params);

    content = applyPageChain(pageChain, params, content, deferComponents);

    for (let i = layoutChain.length - 1; i >= 0; i--) {
      const layout = layoutChain[i].component;
      // Layouts remain part of the route-root render scope. The renderer
      // reconciles their intrinsic root in place, which preserves the shell
      // element while keeping route remount state deterministic.
      content = layout({ children: content });
    }

    return content;
  };
  _associateLazyHandler(handler, [
    component,
    ...pageChain.map((scope) => scope.component),
    ...layoutChain.map((scope) => scope.component),
  ]);
  return handler;
}

export function getRenderHandler(record: RouteRecord): RouteHandler {
  const internalRecord = record as InternalRouteRecord;
  return (
    internalRecord.renderHandler ??
    createRouteHandler(
      record.component,
      record.pageChain,
      record.layoutChain,
      true
    )
  );
}
