import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { SpacerAsChildProps, SpacerDivProps } from './spacer.types';

export function Spacer(props: SpacerDivProps): JSX.Element;
export function Spacer(props: SpacerAsChildProps): JSX.Element;
export function Spacer(props: SpacerDivProps | SpacerAsChildProps) {
  const {
    asChild,
    children,
    grow,
    shrink,
    basis,
    axis,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const layoutStyle: Record<string, string | number> = {};

  if (axis === 'inline') {
    layoutStyle.display = 'block';
    layoutStyle.flexShrink = shrink ?? 0;
    if (isCssLength(basis)) layoutStyle.width = basis!;
  } else if (axis === 'block') {
    layoutStyle.display = 'block';
    layoutStyle.flexShrink = shrink ?? 0;
    if (isCssLength(basis)) layoutStyle.height = basis!;
  } else {
    layoutStyle.flexGrow = grow ?? 1;
    layoutStyle.flexShrink = shrink ?? 1;
    layoutStyle.flexBasis = isCssLength(basis) ? basis! : 'auto';
  }

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'spacer',
    'data-axis': axis,
    'data-grow': grow !== undefined ? String(grow) : undefined,
    'data-shrink': shrink !== undefined ? String(shrink) : undefined,
    'data-basis': basis,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
