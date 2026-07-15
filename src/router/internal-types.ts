import type {
  LayoutScopeRecord,
  PageScopeRecord,
  Route,
  RouteHandler,
  RoutePolicy,
  RouteRecord,
  RouteMetaSource,
} from '../common/router';
import type { AuthRequirement } from '@askrjs/auth';
import type { RenderableChild } from '../common/vnode';

export type AnyRouteComponent = (...args: any[]) => RenderableChild;

export type InternalRoute = Route & {
  fallbackPrefix?: string;
};

export type InternalRouteRecord = RouteRecord & {
  fallbackPrefix?: string;
  renderHandler?: RouteHandler;
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
};
