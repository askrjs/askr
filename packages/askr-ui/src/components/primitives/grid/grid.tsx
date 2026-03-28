import { Slot, mergeProps } from '@askrjs/askr/foundations';
import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { GridAsChildProps, GridDivProps } from './grid.types';

function resolveGridTemplateColumns(
  columns: number | string | undefined,
  minItemWidth: string | undefined,
  autoFit: boolean | undefined
): string | undefined {
  if (typeof columns === 'number') {
    return `repeat(${columns}, minmax(0, 1fr))`;
  }
  if (typeof columns === 'string') {
    const trimmed = columns.trim();
    if (/^\d+$/.test(trimmed)) return `repeat(${trimmed}, minmax(0, 1fr))`;
    return isCssLength(trimmed) ? trimmed : undefined;
  }
  if (isCssLength(minItemWidth)) {
    const fitKeyword = autoFit === false ? 'auto-fill' : 'auto-fit';
    return `repeat(${fitKeyword}, minmax(${minItemWidth!}, 1fr))`;
  }
  return undefined;
}

export function Grid(props: GridDivProps): JSX.Element;
export function Grid(props: GridAsChildProps): JSX.Element;
export function Grid(props: GridDivProps | GridAsChildProps) {
  const {
    asChild,
    children,
    columns,
    minItemWidth,
    gap,
    autoFit,
    align,
    justify,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const gridTemplateColumns = resolveGridTemplateColumns(
    columns,
    minItemWidth,
    autoFit
  );

  const layoutStyle: Record<string, string | number> = { display: 'grid' };
  if (gridTemplateColumns)
    layoutStyle.gridTemplateColumns = gridTemplateColumns;
  if (isCssLength(gap)) layoutStyle.gap = gap!;
  if (align) layoutStyle.alignItems = align;
  if (justify) layoutStyle.justifyItems = justify;

  const finalProps = mergeProps(rest, {
    ref,
    'data-slot': 'grid',
    'data-columns': columns !== undefined ? String(columns) : undefined,
    'data-min-item-width': minItemWidth,
    'data-gap': gap,
    'data-auto-fit': autoFit !== undefined ? String(autoFit) : undefined,
    'data-align': align,
    'data-justify': justify,
    style: mergeLayoutStyles(layoutStyle, userStyle),
  });

  if (asChild) {
    return <Slot asChild {...finalProps} children={children} />;
  }

  return <div {...finalProps}>{children}</div>;
}
