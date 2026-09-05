/**
 * Askr: Lane-scheduled deterministic UI framework
 *
 * Public API surface — only users should import from here
 */

import { installRendererBridge } from './boot/runtime-wiring';

installRendererBridge();

export { createRuntime, getDefaultRuntime } from './compatibility/runtime';
export { createDOMRendererHost } from './compatibility/dom-renderer';
export type {
  DOMComponentOwner,
  DOMChildScope,
  DOMReactiveSource,
  DOMRendererRange,
  DOMRendererEvaluation,
  DOMRendererCleanup,
  DOMRendererScopes,
  DOMRendererKeys,
  DOMRendererReactivity,
  DOMRendererHost,
} from './compatibility/dom-renderer';
export { configureRenderDiagnostics } from './runtime';
export type {
  AskrRuntimeOptions,
  RuntimeRendererHost,
  RuntimeKeyedReorderDecision,
} from './compatibility/runtime';
export type { RenderDiagnosticsOptions } from './runtime';
export { AskrRuntime } from './compatibility/runtime';

// Runtime primitives
export { derive, getSignal, selector, state } from './runtime';
export type {
  Derived,
  Selector,
  State,
  StateSetter,
  StateTuple,
} from './runtime';

// Control flow
export { Case, For, Match, Show } from './control';
export type { CaseProps, ForProps, MatchProps, ShowProps } from './control';

// Lexical scopes
export { defineScope, readScope } from './runtime';
export type { Scope } from './runtime';
export { CspNonceScope, cspNonce } from './csp-nonce';
export { registerSSRStyle } from './common/render-context';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx-runtime';

// Public types
export type { Props } from './common/props';
export { createRef } from './ref';
export type { Ref } from './ref';
export {
  createQuery,
  createQueryCollection,
  defineQuery,
  serveQuery,
  defineServerQueries,
  prefetchQuery,
  dehydrateDataRuntime,
  hydrateDataRuntime,
} from './data';
export type {
  QueryDefinition,
  QueryCollection,
  QueryCollectionEntry,
  QueryCollectionKey,
  QueryCollectionOptions,
  QueryPrefetchContext,
  ServerQueryHandler,
  DataRuntime,
} from './data';
