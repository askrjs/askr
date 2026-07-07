/*
 * Public exports for structural foundations and runtime-backed portal
 * primitives.
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
