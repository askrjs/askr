import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type ContainerOwnProps = {
  /** CSS max-width value or named size token. Inline style only applied for real CSS lengths. */
  maxWidth?: string;
  /** CSS padding-inline value or named spacing token. Inline style only applied for real CSS lengths. */
  padding?: string;
  /** Centers the container by applying margin-inline: auto. */
  centered?: boolean;
  /** Stretches the container to 100% width. */
  fluid?: boolean;
  /** Named size token (e.g. sm, md, lg, xl) – data attribute only, no inline style. */
  size?: string;
  children?: unknown;
};

export type ContainerDivProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  ContainerOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type ContainerAsChildProps = ContainerOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
  style?: JSX.IntrinsicElements['div']['style'];
};

export type ContainerProps = ContainerDivProps | ContainerAsChildProps;
