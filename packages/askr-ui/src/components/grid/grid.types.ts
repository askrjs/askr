import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type GridOwnProps = {
  /**
   * Number of equal columns (generates `repeat(n, minmax(0, 1fr))`); or a raw
   * CSS string (applied as inline style only when it is a real CSS length).
   */
  columns?: number | string;
  /**
   * Minimum item width for an auto-fit/fill grid.
   * Applied as inline style only when it is a real CSS length.
   */
  minItemWidth?: string;
  /** CSS gap value or named spacing token. Inline style only applied for real CSS lengths. */
  gap?: string;
  /**
   * When true (default), uses `auto-fit` for the implicit repeat; when false,
   * uses `auto-fill`. Only relevant when `columns` is absent and `minItemWidth`
   * is a real CSS length.
   */
  autoFit?: boolean;
  /** CSS align-items value. */
  align?: string;
  /** CSS justify-items value. */
  justify?: string;
  children?: unknown;
};

export type GridDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  GridOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type GridAsChildProps = GridOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type GridProps = GridDivProps | GridAsChildProps;
