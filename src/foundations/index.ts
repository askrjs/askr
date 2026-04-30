/*
 * Public exports for foundation primitives.
 *
 * Shared runtime and UI-composition helpers live here so `askr-ui` can depend
 * on a single canonical implementation.
 */

export * from './core';
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
