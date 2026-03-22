import type { Ref } from '@askrjs/askr/foundations';

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
  JSX.IntrinsicElements['svg'],
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
