import '../../jsx/types';
import type { Props } from '../../common/props';
import type { Ref } from '../utilities/compose-ref';

export type IconSizeToken = 'sm' | 'md' | 'lg' | 'xl';

export type IconStyleObject = Record<string, unknown>;

export type IconOwnProps = {
  size?: number | string;
  strokeWidth?: number;
  color?: string;
  title?: string;
  class?: string;
  style?: string | IconStyleObject;
  iconName?: string;
};

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
