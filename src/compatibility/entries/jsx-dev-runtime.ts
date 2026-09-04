/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../jsx/jsx-dev-runtime';
import type * as Contract from '../contracts/jsx-dev-runtime';
export type * from '../contracts/jsx-dev-runtime';

const public_Fragment: typeof Contract.Fragment =
  implementation.Fragment as unknown as typeof Contract.Fragment;
const public_jsxDEV: typeof Contract.jsxDEV = implementation.jsxDEV;

export { public_Fragment as Fragment, public_jsxDEV as jsxDEV };
