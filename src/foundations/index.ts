/*
 * Public exports for the slim structural foundations entrypoint.
 *
 * Lower-level helpers are published from explicit subpaths so consumers can
 * import only the surface they need.
 */

export {
  DefaultPortal,
  Presence,
  Portal,
  Slot,
  definePortal,
  layout,
} from './structures/index';
export type {
  JSXElement,
  LayoutComponent,
  PresenceProps,
  PortalProps,
  SlotProps,
} from './structures/index';
