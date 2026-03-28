import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { SidebarLayoutProps } from './sidebar-layout.types';

export function SidebarLayout(props: SidebarLayoutProps): JSX.Element {
  const {
    sidebar,
    children,
    sidebarPosition = 'start',
    sidebarWidth,
    gap,
    collapseBelow,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const wrapperStyle: Record<string, string | number> = {
    display: 'flex',
    flexDirection: sidebarPosition === 'end' ? 'row-reverse' : 'row',
  };
  if (isCssLength(gap)) wrapperStyle.gap = gap!;

  const sidebarStyle: Record<string, string | number> = { flexShrink: 0 };
  if (isCssLength(sidebarWidth)) {
    sidebarStyle.width = sidebarWidth!;
    sidebarStyle.flexBasis = sidebarWidth!;
  }

  const mainStyle: Record<string, string | number> = {
    flexGrow: 1,
    minWidth: 0,
  };

  return (
    <div
      {...rest}
      ref={ref}
      data-slot="sidebar-layout"
      data-sidebar-position={sidebarPosition}
      data-sidebar-width={sidebarWidth}
      data-gap={gap}
      data-collapse-below={collapseBelow}
      style={mergeLayoutStyles(wrapperStyle, userStyle)}
    >
      <aside
        data-slot="sidebar"
        style={mergeLayoutStyles(sidebarStyle, undefined)}
      >
        {sidebar}
      </aside>
      <main data-slot="main" style={mergeLayoutStyles(mainStyle, undefined)}>
        {children}
      </main>
    </div>
  );
}
