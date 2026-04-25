/*
 * Public exports for foundation primitives
 * Keep this file minimal — it's a convenience barrel for internal imports.
 */

export * from './structures';

export {
  IconBase,
  getIconContractProps,
  isIconSizeToken,
  joinIconStyle,
  normalizeIconSizeValue,
  resolveIconSizeVariable,
  resolveIconStrokeWidthVariable,
  serializeIconStyle,
} from './icon/icon';
export type {
  IconOwnProps,
  IconProps,
  IconSizeToken,
  IconStyleObject,
} from './icon/icon.types';
