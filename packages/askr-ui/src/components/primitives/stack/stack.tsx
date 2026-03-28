import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { StackAsChildProps, StackDivProps } from './stack.types';

export function Stack(props: StackDivProps): JSX.Element;
export function Stack(props: StackAsChildProps): JSX.Element;
export function Stack(props: StackDivProps | StackAsChildProps) {
  const {
    asChild,
    children,
    gap,
    align,
    justify,
    wrap,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const layoutStyle: Record<string, string | number> = {
    display: 'flex',
    flexDirection: 'column',
  };
  if (isCssLength(gap)) layoutStyle.gap = gap!;
  if (align) layoutStyle.alignItems = align;
  if (justify) layoutStyle.justifyContent = justify;
  if (wrap) layoutStyle.flexWrap = wrap;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'stack',
    'data-gap': gap,
    'data-align': align,
    'data-justify': justify,
    'data-wrap': wrap,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
