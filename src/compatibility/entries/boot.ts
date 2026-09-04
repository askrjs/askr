/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../boot/index';
import type * as Contract from '../contracts/boot/index';
export type * from '../contracts/boot/index';

const public_cleanupApp: typeof Contract.cleanupApp = implementation.cleanupApp;
const public_createIsland: typeof Contract.createIsland =
  implementation.createIsland as unknown as typeof Contract.createIsland;
const public_createIslands: typeof Contract.createIslands =
  implementation.createIslands as unknown as typeof Contract.createIslands;
const public_createSPA: typeof Contract.createSPA =
  implementation.createSPA as unknown as typeof Contract.createSPA;
const public_hasApp: typeof Contract.hasApp = implementation.hasApp;
const public_hydrateSPA: typeof Contract.hydrateSPA =
  implementation.hydrateSPA as unknown as typeof Contract.hydrateSPA;

export {
  public_cleanupApp as cleanupApp,
  public_createIsland as createIsland,
  public_createIslands as createIslands,
  public_createSPA as createSPA,
  public_hasApp as hasApp,
  public_hydrateSPA as hydrateSPA,
};
