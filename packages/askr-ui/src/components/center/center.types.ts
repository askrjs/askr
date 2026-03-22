import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type CenterAxis = 'both' | 'horizontal' | 'vertical';

export type CenterOwnProps = {
  /** Which axes to center on. Defaults to 'both'. */
  axis?: CenterAxis;
  /** Uses inline-flex instead of flex. */
  inline?: boolean;
  /** CSS min-height value. Applied as inline style only when it is a real CSS length. */
  minHeight?: string;
  children?: unknown;
};

export type CenterDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  CenterOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type CenterAsChildProps = CenterOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type CenterProps = CenterDivProps | CenterAsChildProps;
