/**
 * askr/router — routing surface (explicit tier)
 */

export {
  route,
  registerRoute,
  registerRoute as defineRoute,
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
} from '../common/router';

export { navigate } from './navigate';

export { Link } from '../components/link';
export type { LinkProps } from '../components/link';

export { layout } from '../foundations/structures/layout';
