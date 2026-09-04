/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../foundations/structures/index';
import type * as Contract from '../contracts/foundations/structures/index';
export type * from '../contracts/foundations/structures/index';

const public_DefaultPortal: typeof Contract.DefaultPortal =
  implementation.DefaultPortal as unknown as typeof Contract.DefaultPortal;
const public_Portal: typeof Contract.Portal =
  implementation.Portal as unknown as typeof Contract.Portal;
const public_Presence: typeof Contract.Presence =
  implementation.Presence as unknown as typeof Contract.Presence;
const public_Slot: typeof Contract.Slot =
  implementation.Slot as unknown as typeof Contract.Slot;
const public_cloneElement: typeof Contract.cloneElement =
  implementation.cloneElement;
const public_createCollection: typeof Contract.createCollection =
  implementation.createCollection;
const public_createLayer: typeof Contract.createLayer =
  implementation.createLayer;
const public_definePortal: typeof Contract.definePortal =
  implementation.definePortal as unknown as typeof Contract.definePortal;
const public_isElement: typeof Contract.isElement = implementation.isElement;
const public_layout: typeof Contract.layout =
  implementation.layout as unknown as typeof Contract.layout;

export {
  public_DefaultPortal as DefaultPortal,
  public_Portal as Portal,
  public_Presence as Presence,
  public_Slot as Slot,
  public_cloneElement as cloneElement,
  public_createCollection as createCollection,
  public_createLayer as createLayer,
  public_definePortal as definePortal,
  public_isElement as isElement,
  public_layout as layout,
};
