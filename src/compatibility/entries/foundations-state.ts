/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../foundations/state/index';
import type * as Contract from '../contracts/foundations/state/index';
export type * from '../contracts/foundations/state/index';

const public_controllableState: typeof Contract.controllableState =
  implementation.controllableState as unknown as typeof Contract.controllableState;
const public_isControlled: typeof Contract.isControlled =
  implementation.isControlled;
const public_makeControllable: typeof Contract.makeControllable =
  implementation.makeControllable;
const public_resolveControllable: typeof Contract.resolveControllable =
  implementation.resolveControllable;

export {
  public_controllableState as controllableState,
  public_isControlled as isControlled,
  public_makeControllable as makeControllable,
  public_resolveControllable as resolveControllable,
};
