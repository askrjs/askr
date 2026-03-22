import type {
  ButtonLikeAsChildProps,
  ButtonLikeProps,
  BoxAsChildProps,
  BoxProps,
} from '../_internal/types';

export type AccordionOrientation = 'vertical' | 'horizontal';

type AccordionSharedOwnProps = {
  children?: unknown;
  id?: string;
  orientation?: AccordionOrientation;
  loop?: boolean;
  collapsible?: boolean;
};

export type AccordionSingleProps = BoxProps<'div', HTMLDivElement> &
  AccordionSharedOwnProps & {
    type?: 'single';
    value?: string;
    defaultValue?: string;
    onValueChange?: (value: string) => void;
  };

export type AccordionMultipleProps = BoxProps<'div', HTMLDivElement> &
  AccordionSharedOwnProps & {
    type: 'multiple';
    value?: string[];
    defaultValue?: string[];
    onValueChange?: (value: string[]) => void;
  };

export type AccordionProps = AccordionSingleProps | AccordionMultipleProps;

export type AccordionItemOwnProps = {
  children?: unknown;
  value: string;
  disabled?: boolean;
};

export type AccordionItemProps = BoxProps<'div', HTMLDivElement> &
  AccordionItemOwnProps;

export type AccordionHeaderProps = BoxProps<'h3', HTMLHeadingElement>;
export type AccordionHeaderAsChildProps = BoxAsChildProps;

export type AccordionTriggerProps = ButtonLikeProps<
  'button',
  HTMLButtonElement
>;
export type AccordionTriggerAsChildProps = ButtonLikeAsChildProps;

export type AccordionContentOwnProps = {
  forceMount?: boolean;
};

export type AccordionContentProps = BoxProps<'div', HTMLDivElement> &
  AccordionContentOwnProps;
export type AccordionContentAsChildProps = BoxAsChildProps &
  AccordionContentOwnProps;
