import type { Ref } from '@askrjs/askr/foundations';

export type SidebarPosition = 'start' | 'end';

export type SidebarLayoutProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> & {
  /** Content rendered into the sidebar slot (aside). */
  sidebar?: unknown;
  /** Content rendered into the main slot. */
  children?: unknown;
  /** Which side the sidebar appears on. Defaults to 'start'. */
  sidebarPosition?: SidebarPosition;
  /** CSS width for the sidebar. Applied as inline style only when it is a real CSS length. */
  sidebarWidth?: string;
  /** CSS gap between sidebar and main. Applied as inline style only when it is a real CSS length. */
  gap?: string;
  /**
   * Named breakpoint below which the layout collapses to a single column.
   * Official themes recognize `sm`, `md`, `lg`, and `xl`.
   */
  collapseBelow?: string;
  ref?: Ref<HTMLDivElement>;
};
