/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../foundations/interactions/index';
import type * as Contract from '../contracts/foundations/interactions/index';
export type * from '../contracts/foundations/interactions/index';

const public_applyInteractionPolicy: typeof Contract.applyInteractionPolicy =
  implementation.applyInteractionPolicy;
const public_dismissable: typeof Contract.dismissable =
  implementation.dismissable;
const public_focusable: typeof Contract.focusable = implementation.focusable;
const public_hoverable: typeof Contract.hoverable = implementation.hoverable;
const public_mergeInteractionProps: typeof Contract.mergeInteractionProps =
  implementation.mergeInteractionProps;
const public_pressable: typeof Contract.pressable = implementation.pressable;
const public_rovingFocus: typeof Contract.rovingFocus =
  implementation.rovingFocus;

export {
  public_applyInteractionPolicy as applyInteractionPolicy,
  public_dismissable as dismissable,
  public_focusable as focusable,
  public_hoverable as hoverable,
  public_mergeInteractionProps as mergeInteractionProps,
  public_pressable as pressable,
  public_rovingFocus as rovingFocus,
};
