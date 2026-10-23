import type {
  LayoutScopeRecord,
  PageScopeRecord,
  Route,
  RouteHandler,
  RouteOptions,
  RouteScopeLoader,
  RouteStaleTime,
  RoutePolicy,
  RouteRecord,
  RouteMetaSource,
  RouteSearch,
} from '../common/router';
import type { AuthRequirement } from '@askrjs/auth';
import type { ObjectSchema } from '@askrjs/schema';
import type { RenderableChild } from '../common/vnode';

export type AnyRouteComponent = (...args: any[]) => RenderableChild;

export type AppMetaDeclaration = Readonly<{ path: string; appMeta: unknown }>;

export type InternalRoute = Route & {
  fallbackPrefix?: string;
  searchSchema?: ObjectSchema<RouteSearch>;
  appMetaChain?: readonly AppMetaDeclaration[];
};

export type InternalRouteRecord = RouteRecord & {
  fallbackPrefix?: string;
  renderHandler?: RouteHandler;
  appMetaChain?: readonly AppMetaDeclaration[];
  /** Group/page loaders from the outermost scope in, run beside the leaf's. */
  loaderChain?: readonly ScopeLoaderRecord[];
  errorComponent?: RouteOptions['error'];
  forbiddenComponent?: RouteOptions['forbidden'];
};

export type ScopeLoaderRecord = Readonly<{
  loader: RouteScopeLoader;
  staleTimeMs?: RouteStaleTime;
}>;

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
  loader?: RouteScopeLoader;
  staleTimeMs?: RouteStaleTime;
};
