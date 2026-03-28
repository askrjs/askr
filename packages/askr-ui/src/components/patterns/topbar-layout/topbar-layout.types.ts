import type { Ref } from '@askrjs/askr/foundations';

export type TopbarLayoutProps = Omit<
  JSX.IntrinsicElements['div'],
  'children' | 'ref'
> & {
  /** Content rendered into the topbar/navbar slot (header). */
  topbar?: unknown;
  /** Content rendered into the main slot. */
  children?: unknown;
  /** CSS height for the topbar. Applied as inline style only when it is a real CSS length. */
  topbarHeight?: string;
  /** CSS gap between topbar and main. Applied as inline style only when it is a real CSS length. */
  gap?: string;
  ref?: Ref<HTMLDivElement>;
};
