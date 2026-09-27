/**
 * Askr: TypeScript UI runtime with getter-based state, fine-grained bindings,
 * transactional commits with rollback, and one route graph for SPA, SSR, and SSG.
 *
 * Public API surface — only users should import from here
 */

export { configureRenderDiagnostics } from './core/component/diagnostics';
export type { RenderDiagnosticsOptions } from './core/component/diagnostics';

// Runtime primitives
export { derive, getSignal, selector, state } from './core/api/state';
export type {
  Derived,
  Selector,
  State,
  StateSetter,
  StateTuple,
} from './core/api/state';

// Lexical scopes
export { defineScope, readScope } from './core/api/scope';
export type { Scope } from './core/api/scope';
export { CspNonceScope, cspNonce } from './csp-nonce';
export { registerSSRStyle } from './common/render-context';

// Re-export JSX runtime for tsconfig jsxImportSource
export { jsx, jsxs, Fragment } from './jsx-runtime';
// Classic factory the automatic transform uses for a key after a spread.
export { createElement } from './jsx/jsx-runtime';

// Public types
export type { Props } from './common/props';
export { createRef } from './ref';
export type { Ref } from './ref';
