import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { CenterAsChildProps, CenterDivProps } from './center.types';

export function Center(props: CenterDivProps): JSX.Element;
export function Center(props: CenterAsChildProps): JSX.Element;
export function Center(props: CenterDivProps | CenterAsChildProps) {
  const {
    asChild,
    children,
    axis = 'both',
    inline,
    minHeight,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const centerH = axis === 'both' || axis === 'horizontal';
  const centerV = axis === 'both' || axis === 'vertical';

  const layoutStyle: Record<string, string | number> = {
    display: inline ? 'inline-flex' : 'flex',
  };
  if (centerH) layoutStyle.justifyContent = 'center';
  if (centerV) layoutStyle.alignItems = 'center';
  if (isCssLength(minHeight)) layoutStyle.minHeight = minHeight!;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'center',
    'data-axis': axis,
    'data-inline': inline !== undefined ? String(inline) : undefined,
    'data-min-height': minHeight,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
