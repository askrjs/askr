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
};
