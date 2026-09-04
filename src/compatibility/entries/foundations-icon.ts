/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../foundations/icon/index';
import type * as Contract from '../contracts/foundations/icon/index';
export type * from '../contracts/foundations/icon/index';

const public_IconBase: typeof Contract.IconBase = implementation.IconBase;
const public_getIconContractProps: typeof Contract.getIconContractProps =
  implementation.getIconContractProps;
const public_isIconSizeToken: typeof Contract.isIconSizeToken =
  implementation.isIconSizeToken;
const public_joinIconStyle: typeof Contract.joinIconStyle =
  implementation.joinIconStyle;
const public_normalizeIconSizeValue: typeof Contract.normalizeIconSizeValue =
  implementation.normalizeIconSizeValue;
const public_resolveIconSizeVariable: typeof Contract.resolveIconSizeVariable =
  implementation.resolveIconSizeVariable;
const public_resolveIconStrokeWidthVariable: typeof Contract.resolveIconStrokeWidthVariable =
  implementation.resolveIconStrokeWidthVariable;
const public_serializeIconStyle: typeof Contract.serializeIconStyle =
  implementation.serializeIconStyle;

export {
  public_IconBase as IconBase,
  public_getIconContractProps as getIconContractProps,
  public_isIconSizeToken as isIconSizeToken,
  public_joinIconStyle as joinIconStyle,
  public_normalizeIconSizeValue as normalizeIconSizeValue,
  public_resolveIconSizeVariable as resolveIconSizeVariable,
  public_resolveIconStrokeWidthVariable as resolveIconStrokeWidthVariable,
  public_serializeIconStyle as serializeIconStyle,
};
