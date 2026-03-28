/**
 * askr/router — routing surface (explicit tier)
 */

export {
  route,
  layout,
  lazy,
  getManifest,
  _applyManifest,
  _drainLazy,
  getRoutes,
  clearRoutes,
  getNamespaceRoutes,
  unloadNamespace,
  getLoadedNamespaces,
  setServerLocation,
} from './route';
export type {
  Route,
  RouteHandler,
  RouteSnapshot,
  RouteMatch,
  RouteQuery,
  RouteComponent,
  RouteOptions,
  ParsedSegment,
  LayoutScopeRecord,
  RouteRecord,
  RouteManifest,
} from '../common/router';

export { navigate } from './navigate';
export type { NavigateOptions } from './navigate';

export { Link } from '../components/link';
export type { LinkProps } from '../components/link';
