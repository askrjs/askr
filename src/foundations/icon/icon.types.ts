import '../../jsx/types';
import type { Props } from '../../common/props';
import type { Ref } from '../utilities/compose-ref';

/** Named icon size presets, mapped to CSS variables at render time. */
export type IconSizeToken = 'sm' | 'md' | 'lg' | 'xl';

/** Camel-cased CSS style object accepted by icon `style` props. */
export type IconStyleObject = Record<string, unknown>;

/** Props specific to the icon contract, independent of the underlying `<svg>` props. */
export type IconOwnProps = {
  size?: number | string;
  strokeWidth?: number;
  color?: string;
  title?: string;
  class?: string;
  style?: string | IconStyleObject;
  iconName?: string;
};

/** Full prop set accepted by {@link IconBase} and generated icon components. */
export type IconProps = Omit<
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
