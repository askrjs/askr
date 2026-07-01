import type {
  LayoutScopeRecord,
  PageScopeRecord,
  Route,
  RouteHandler,
  RoutePolicy,
  RouteRecord,
} from '../common/router';
import type { RenderableChild } from '../common/vnode';

export type AnyRouteComponent = (...args: any[]) => RenderableChild;

export type InternalRoute = Route & {
  fallbackPrefix?: string;
};

export type InternalRouteRecord = RouteRecord & {
  fallbackPrefix?: string;
  renderHandler?: RouteHandler;
};

export type AccessScopeState = {
  guestOnly: boolean;
  authenticated: boolean;
};

export type RegistrationScope = {
  kind: 'group' | 'page';
  pathPrefix: string;
  layout?: LayoutScopeRecord['component'];
  page?: PageScopeRecord['component'];
  hasIndex?: boolean;
  policies: readonly RoutePolicy[];
  state: AccessScopeState;
};

export type RegistrationSession = {
  authConfigured: boolean;
};
