import { isCssLength, mergeLayoutStyles } from '../../_internal/layout';
import type { TopbarLayoutProps } from './topbar-layout.types';

export function TopbarLayout(props: TopbarLayoutProps): JSX.Element {
  const {
    topbar,
    children,
    topbarHeight,
    gap,
    ref,
    style: userStyle,
    ...rest
  } = props;

  const wrapperStyle: Record<string, string | number> = {
    display: 'flex',
    flexDirection: 'column',
  };
  if (isCssLength(gap)) wrapperStyle.gap = gap!;

  const navbarStyle: Record<string, string | number> = { flexShrink: 0 };
  if (isCssLength(topbarHeight)) navbarStyle.height = topbarHeight!;

  const mainStyle: Record<string, string | number> = {
    flexGrow: 1,
    minWidth: 0,
  };

  return (
    <div
      {...rest}
      ref={ref}
      data-slot="topbar-layout"
      data-topbar-height={topbarHeight}
      data-gap={gap}
      style={mergeLayoutStyles(wrapperStyle, userStyle)}
    >
      <header
        data-slot="navbar"
        style={mergeLayoutStyles(navbarStyle, undefined)}
      >
        {topbar}
      </header>
      <main data-slot="main" style={mergeLayoutStyles(mainStyle, undefined)}>
        {children}
      </main>
    </div>
  );
}
