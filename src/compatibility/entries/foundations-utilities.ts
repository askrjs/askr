/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../foundations/utilities/index';
import type * as Contract from '../contracts/foundations/utilities/index';
export type * from '../contracts/foundations/utilities/index';

const public_ariaDisabled: typeof Contract.ariaDisabled =
  implementation.ariaDisabled;
const public_ariaExpanded: typeof Contract.ariaExpanded =
  implementation.ariaExpanded;
const public_ariaSelected: typeof Contract.ariaSelected =
  implementation.ariaSelected;
const public_composeHandlers: typeof Contract.composeHandlers =
  implementation.composeHandlers;
const public_composeRefs: typeof Contract.composeRefs =
  implementation.composeRefs;
const public_formatId: typeof Contract.formatId = implementation.formatId;
const public_mergeProps: typeof Contract.mergeProps = implementation.mergeProps;
const public_setRef: typeof Contract.setRef = implementation.setRef;

export {
  public_ariaDisabled as ariaDisabled,
  public_ariaExpanded as ariaExpanded,
  public_ariaSelected as ariaSelected,
  public_composeHandlers as composeHandlers,
  public_composeRefs as composeRefs,
  public_formatId as formatId,
  public_mergeProps as mergeProps,
  public_setRef as setRef,
};
