import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { InlineAsChildProps, InlineDivProps } from './inline.types';

export function Inline(props: InlineDivProps): JSX.Element;
export function Inline(props: InlineAsChildProps): JSX.Element;
export function Inline(props: InlineDivProps | InlineAsChildProps) {
  const {
    asChild,
    children,
    gap,
    align,
    justify,
    wrap,
    collapseBelow,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const layoutStyle: Record<string, string | number> = {
    display: 'flex',
    flexDirection: 'row',
  };
  if (isCssLength(gap)) layoutStyle.gap = gap!;
  if (align) layoutStyle.alignItems = align;
  if (justify) layoutStyle.justifyContent = justify;
  if (wrap) layoutStyle.flexWrap = wrap;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'inline',
    'data-gap': gap,
    'data-align': align,
    'data-justify': justify,
    'data-wrap': wrap,
    'data-collapse-below': collapseBelow,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
