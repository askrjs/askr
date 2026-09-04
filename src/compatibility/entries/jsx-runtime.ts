/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../jsx/jsx-runtime';
import type * as Contract from '../contracts/jsx-runtime';
export type * from '../contracts/jsx-runtime';

const public_Fragment: typeof Contract.Fragment =
  implementation.Fragment as unknown as typeof Contract.Fragment;
const public_jsx: typeof Contract.jsx = implementation.jsx;
const public_jsxDEV: typeof Contract.jsxDEV = implementation.jsxDEV;
const public_jsxs: typeof Contract.jsxs = implementation.jsxs;

export {
  public_Fragment as Fragment,
  public_jsx as jsx,
  public_jsxDEV as jsxDEV,
  public_jsxs as jsxs,
};
