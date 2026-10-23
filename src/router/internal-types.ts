import type {
  LayoutScopeRecord,
  PageScopeRecord,
  Route,
  RouteHandler,
  RouteOptions,
  RoutePolicy,
  RouteRecord,
  RouteMetaSource,
} from '../common/router';
import type { AuthRequirement } from '@askrjs/auth';
import type { RenderableChild } from '../common/vnode';

export type AnyRouteComponent = (...args: any[]) => RenderableChild;

export type AppMetaDeclaration = Readonly<{ path: string; appMeta: unknown }>;

export type InternalRoute = Route & {
  fallbackPrefix?: string;
  appMetaChain?: readonly AppMetaDeclaration[];
};

export type InternalRouteRecord = RouteRecord & {
  fallbackPrefix?: string;
  renderHandler?: RouteHandler;
  appMetaChain?: readonly AppMetaDeclaration[];
  errorComponent?: RouteOptions['error'];
  forbiddenComponent?: RouteOptions['forbidden'];
};

export type RegistrationScope = {
  kind: 'group' | 'page';
  pathPrefix: string;
  layout?: LayoutScopeRecord['component'];
  page?: PageScopeRecord['component'];
  hasIndex?: boolean;
  auth?: AuthRequirement;
  policies: readonly RoutePolicy[];
  meta?: RouteMetaSource;
  appMeta?: unknown;
  error?: RouteOptions['error'];
  forbidden?: RouteOptions['forbidden'];
};
