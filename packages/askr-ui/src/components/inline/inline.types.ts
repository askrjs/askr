import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type InlineOwnProps = {
  /** CSS gap value or named spacing token. Inline style only applied for real CSS lengths. */
  gap?: string;
  /** CSS align-items value. */
  align?: string;
  /** CSS justify-content value. */
  justify?: string;
  /** CSS flex-wrap value. */
  wrap?: 'wrap' | 'nowrap' | 'wrap-reverse';
  /**
   * Named breakpoint below which the row layout collapses to a column.
   * Official themes recognize `sm`, `md`, `lg`, and `xl`.
   */
  collapseBelow?: string;
  children?: unknown;
};

export type InlineDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  InlineOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type InlineAsChildProps = InlineOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type InlineProps = InlineDivProps | InlineAsChildProps;
