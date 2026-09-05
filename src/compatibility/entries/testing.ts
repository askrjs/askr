/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../testing/index';
import { installOwnershipViews } from '../ownership';
import type * as Contract from '../contracts/testing/index';
export type * from '../contracts/testing/index';

installOwnershipViews();

const public_cleanup: typeof Contract.cleanup = implementation.cleanup;
const public_click: typeof Contract.click = implementation.click;
const public_createInvalidationRecorder: typeof Contract.createInvalidationRecorder =
  implementation.createInvalidationRecorder;
const public_createMutationTestRegistry: typeof Contract.createMutationTestRegistry =
  implementation.createMutationTestRegistry;
const public_createQueryTestRegistry: typeof Contract.createQueryTestRegistry =
  implementation.createQueryTestRegistry;
const public_dispatch: typeof Contract.dispatch = implementation.dispatch;
const public_flush: typeof Contract.flush = implementation.flush;
const public_getRouteWarnings: typeof Contract.getRouteWarnings =
  implementation.getRouteWarnings as unknown as typeof Contract.getRouteWarnings;
const public_matchRoute: typeof Contract.matchRoute =
  implementation.matchRoute as unknown as typeof Contract.matchRoute;
const public_mockQuery: typeof Contract.mockQuery = implementation.mockQuery;
const public_mount: typeof Contract.mount =
  implementation.mount as unknown as typeof Contract.mount;
const public_mutationState: typeof Contract.mutationState =
  implementation.mutationState;
const public_queryState: typeof Contract.queryState = implementation.queryState;
const public_render: typeof Contract.render =
  implementation.render as unknown as typeof Contract.render;
const public_renderRoute: typeof Contract.renderRoute =
  implementation.renderRoute as unknown as typeof Contract.renderRoute;
const public_submit: typeof Contract.submit = implementation.submit;
const public_type: typeof Contract.type = implementation.type;

export {
  public_cleanup as cleanup,
  public_click as click,
  public_createInvalidationRecorder as createInvalidationRecorder,
  public_createMutationTestRegistry as createMutationTestRegistry,
  public_createQueryTestRegistry as createQueryTestRegistry,
  public_dispatch as dispatch,
  public_flush as flush,
  public_getRouteWarnings as getRouteWarnings,
  public_matchRoute as matchRoute,
  public_mockQuery as mockQuery,
  public_mount as mount,
  public_mutationState as mutationState,
  public_queryState as queryState,
  public_render as render,
  public_renderRoute as renderRoute,
  public_submit as submit,
  public_type as type,
};
