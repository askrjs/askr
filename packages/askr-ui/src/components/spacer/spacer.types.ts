import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type SpacerAxis = 'inline' | 'block';

export type SpacerOwnProps = {
  /** flex-grow factor (default 1 when no axis is set). */
  grow?: number;
  /** flex-shrink factor (default 1 when no axis is set, 0 when axis is set). */
  shrink?: number;
  /** CSS flex-basis / width (axis=inline) / height (axis=block) value. Applied as inline style only when it is a real CSS length. */
  basis?: string;
  /** When set, renders a fixed space along the given axis instead of a flex-grow spacer. */
  axis?: SpacerAxis;
  children?: unknown;
};

export type SpacerDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  SpacerOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type SpacerAsChildProps = SpacerOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type SpacerProps = SpacerDivProps | SpacerAsChildProps;
