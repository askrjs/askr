/**
 * askr/router — routing surface (explicit tier)
 */

export { route, getRoutes, clearRoutes } from './route';
export type {
  Route,
  RouteHandler,
  RouteSnapshot,
  RouteMatch,
  RouteQuery,
} from '../common/router';

export { navigate } from './navigate';

export { Link } from '../components/Link';
export type { LinkProps } from '../components/Link';

export { layout } from '../foundations/structures/layout';
