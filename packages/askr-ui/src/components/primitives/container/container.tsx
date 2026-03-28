import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type {
  ContainerAsChildProps,
  ContainerDivProps,
} from './container.types';

export function Container(props: ContainerDivProps): JSX.Element;
export function Container(props: ContainerAsChildProps): JSX.Element;
export function Container(props: ContainerDivProps | ContainerAsChildProps) {
  const {
    asChild,
    children,
    centered = true,
    fluid = true,
    maxWidth,
    padding,
    size,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const layoutStyle: Record<string, string | number> = {
    boxSizing: 'border-box',
  };
  if (fluid) layoutStyle.width = '100%';
  if (isCssLength(maxWidth)) layoutStyle.maxWidth = maxWidth!;
  if (isCssLength(padding)) layoutStyle.paddingInline = padding!;
  if (centered) layoutStyle.marginInline = 'auto';

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'container',
    'data-max-width': maxWidth,
    'data-padding': padding,
    'data-centered': centered !== undefined ? String(centered) : undefined,
    'data-fluid': fluid !== undefined ? String(fluid) : undefined,
    'data-size': size,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
