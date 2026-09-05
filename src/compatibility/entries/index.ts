/** Published compatibility boundary. Implementations own execution; contracts own consumer types. */
import * as implementation from '../../index';
import type * as Contract from '../contracts/index';
export type * from '../contracts/index';
export const createDOMRendererHost: typeof Contract.createDOMRendererHost =
  implementation.createDOMRendererHost;

const public_AskrRuntime: typeof Contract.AskrRuntime =
  implementation.AskrRuntime as unknown as typeof Contract.AskrRuntime;
type public_AskrRuntime = Contract.AskrRuntime;
const public_Case: typeof Contract.Case =
  implementation.Case as unknown as typeof Contract.Case;
const public_CspNonceScope: typeof Contract.CspNonceScope =
  implementation.CspNonceScope as unknown as typeof Contract.CspNonceScope;
const public_For: typeof Contract.For =
  implementation.For as unknown as typeof Contract.For;
const public_Fragment: typeof Contract.Fragment =
  implementation.Fragment as unknown as typeof Contract.Fragment;
const public_Match: typeof Contract.Match =
  implementation.Match as unknown as typeof Contract.Match;
const public_Show: typeof Contract.Show =
  implementation.Show as unknown as typeof Contract.Show;
const public_configureRenderDiagnostics: typeof Contract.configureRenderDiagnostics =
  implementation.configureRenderDiagnostics;
const public_createQuery: typeof Contract.createQuery =
  implementation.createQuery;
const public_createQueryCollection: typeof Contract.createQueryCollection =
  implementation.createQueryCollection;
const public_createRef: typeof Contract.createRef = implementation.createRef;
const public_createRuntime: typeof Contract.createRuntime =
  implementation.createRuntime as unknown as typeof Contract.createRuntime;
const public_cspNonce: typeof Contract.cspNonce = implementation.cspNonce;
const public_defineQuery: typeof Contract.defineQuery =
  implementation.defineQuery;
const public_defineScope: typeof Contract.defineScope =
  implementation.defineScope as unknown as typeof Contract.defineScope;
const public_defineServerQueries: typeof Contract.defineServerQueries =
  implementation.defineServerQueries;
const public_dehydrateDataRuntime: typeof Contract.dehydrateDataRuntime =
  implementation.dehydrateDataRuntime;
const public_derive: typeof Contract.derive =
  implementation.derive as unknown as typeof Contract.derive;
const public_getDefaultRuntime: typeof Contract.getDefaultRuntime =
  implementation.getDefaultRuntime as unknown as typeof Contract.getDefaultRuntime;
const public_getSignal: typeof Contract.getSignal = implementation.getSignal;
const public_hydrateDataRuntime: typeof Contract.hydrateDataRuntime =
  implementation.hydrateDataRuntime;
const public_jsx: typeof Contract.jsx = implementation.jsx;
const public_jsxs: typeof Contract.jsxs = implementation.jsxs;
const public_prefetchQuery: typeof Contract.prefetchQuery =
  implementation.prefetchQuery;
const public_readScope: typeof Contract.readScope =
  implementation.readScope as unknown as typeof Contract.readScope;
const public_registerSSRStyle: typeof Contract.registerSSRStyle =
  implementation.registerSSRStyle;
const public_selector: typeof Contract.selector = implementation.selector;
const public_serveQuery: typeof Contract.serveQuery = implementation.serveQuery;
const public_state: typeof Contract.state =
  implementation.state as unknown as typeof Contract.state;

export {
  public_AskrRuntime as AskrRuntime,
  public_Case as Case,
  public_CspNonceScope as CspNonceScope,
  public_For as For,
  public_Fragment as Fragment,
  public_Match as Match,
  public_Show as Show,
  public_configureRenderDiagnostics as configureRenderDiagnostics,
  public_createQuery as createQuery,
  public_createQueryCollection as createQueryCollection,
  public_createRef as createRef,
  public_createRuntime as createRuntime,
  public_cspNonce as cspNonce,
  public_defineQuery as defineQuery,
  public_defineScope as defineScope,
  public_defineServerQueries as defineServerQueries,
  public_dehydrateDataRuntime as dehydrateDataRuntime,
  public_derive as derive,
  public_getDefaultRuntime as getDefaultRuntime,
  public_getSignal as getSignal,
  public_hydrateDataRuntime as hydrateDataRuntime,
  public_jsx as jsx,
  public_jsxs as jsxs,
  public_prefetchQuery as prefetchQuery,
  public_readScope as readScope,
  public_registerSSRStyle as registerSSRStyle,
  public_selector as selector,
  public_serveQuery as serveQuery,
  public_state as state,
};
