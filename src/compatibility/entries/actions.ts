/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../actions/index';
import type * as Contract from '../contracts/actions/index';
export type * from '../contracts/actions/index';

const public_ActionForm: typeof Contract.ActionForm =
  implementation.ActionForm as unknown as typeof Contract.ActionForm;
const public_action: typeof Contract.action =
  implementation.action as unknown as typeof Contract.action;
const public_defineAction: typeof Contract.defineAction =
  implementation.defineAction;

export {
  public_ActionForm as ActionForm,
  public_action as action,
  public_defineAction as defineAction,
};
