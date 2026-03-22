import type { JSXElement, Ref } from '@askrjs/askr/foundations';

export type DismissableLayerOwnProps = {
  children?: unknown;
  id?: string;
  disabled?: boolean;
  disableOutsidePointerEvents?: boolean;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: PointerEvent) => void;
  onInteractOutside?: (event: Event) => void;
  onDismiss?: () => void;
};

export type DismissableLayerProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> &
  DismissableLayerOwnProps & {
    asChild?: false;
    ref?: Ref<HTMLDivElement>;
  };

export type DismissableLayerAsChildProps = DismissableLayerOwnProps & {
  asChild: true;
  children: JSXElement;
  ref?: Ref<unknown>;
};
