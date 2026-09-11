import { JSXElement, Props } from '../../elements.js';
import { Ref } from '../../refs.js';
/** Named icon size presets, mapped to CSS variables at render time. */
type IconSizeToken = 'sm' | 'md' | 'lg' | 'xl';
/** Camel-cased CSS style object accepted by icon `style` props. */
type IconStyleObject = Record<string, unknown>;
/** Props specific to the icon contract, independent of the underlying `<svg>` props. */
type IconOwnProps = {
  size?: number | string;
  strokeWidth?: number;
  color?: string;
  title?: string;
  class?: string;
  style?: string | IconStyleObject;
  iconName?: string;
};
/** Full prop set accepted by {@link IconBase} and generated icon components. */
type IconProps = Omit<
  Props,
  | 'children'
  | 'class'
  | 'color'
  | 'height'
  | 'ref'
  | 'role'
  | 'stroke'
  | 'stroke-width'
  | 'style'
  | 'title'
  | 'width'
> &
  IconOwnProps & {
    children?: unknown;
    ref?: Ref<SVGSVGElement>;
  };
/** Check whether `value` is one of the named icon size tokens ('sm'|'md'|'lg'|'xl'). */
declare function isIconSizeToken(value: unknown): value is IconSizeToken;
/** Normalize a numeric icon size to a `px` string; strings pass through unchanged. */
declare function normalizeIconSizeValue(size: number | string): string;
/** Resolve a size (token or literal) to a CSS `var(--ak-icon-size-*, ...)` expression or literal value. */
declare function resolveIconSizeVariable(size: number | string): string;
/** Resolve a stroke width to a CSS `var(--ak-icon-stroke-width-*, ...)` expression, scoped to `sizeToken` when given. */
declare function resolveIconStrokeWidthVariable(
  strokeWidth: number,
  sizeToken: IconSizeToken | undefined
): string;
/** Serialize an inline style object (or pass through a string) to a CSS declaration string. */
declare function serializeIconStyle(
  style: string | IconStyleObject | undefined
): string;
/** Join non-empty CSS declaration fragments with `;`, dropping any that are blank. */
declare function joinIconStyle(
  ...styles: Array<string | undefined>
): string | undefined;
/** Compute the shared SVG attributes and inline style implementing the icon size/stroke/color contract. */
declare function getIconContractProps({
  size,
  strokeWidth,
  color,
  title,
  style,
  iconName,
}: Pick<
  IconProps,
  'color' | 'iconName' | 'size' | 'strokeWidth' | 'style' | 'title'
>): {
  sizeToken: IconSizeToken | undefined;
  decorative: string | undefined;
  iconStyle: string | undefined;
  attrs: {
    xmlns: string;
    width: string;
    height: string;
    fill: string;
    stroke: string;
    'stroke-width': string;
    role: string;
    'aria-hidden': string | undefined;
    style: string | undefined;
    'data-slot': string;
    'data-icon': string | undefined;
    'data-size': IconSizeToken | undefined;
    'data-decorative': string | undefined;
    'data-color': string | undefined;
  };
};
/** Base `<svg>` wrapper implementing the icon contract; generated icon components render into it. */
declare function IconBase({
  size,
  strokeWidth,
  color,
  title,
  class: className,
  style,
  iconName,
  children,
  ref,
  ...rest
}: IconProps): JSXElement;
export {
  IconBase,
  type IconOwnProps,
  type IconProps,
  type IconSizeToken,
  type IconStyleObject,
  getIconContractProps,
  isIconSizeToken,
  joinIconStyle,
  normalizeIconSizeValue,
  resolveIconSizeVariable,
  resolveIconStrokeWidthVariable,
  serializeIconStyle,
};
