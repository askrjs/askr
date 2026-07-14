import type {
  GroupHelperOptions,
  RouteOptions,
  RoutePolicy,
} from '../common/router';

export function compileNodePolicies(
  node: Pick<RouteOptions | GroupHelperOptions, 'policies'>
): RoutePolicy[] {
  return node.policies ? [...node.policies] : [];
}
