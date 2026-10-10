import {
  cspNonce,
  selector,
  configureRenderDiagnostics,
  StateSetter,
  StateTuple,
  registerSSRStyle,
  state,
  createRef,
  RenderDiagnosticsOptions,
  RenderableChild,
  derive,
  defineScope,
  Derived,
  State,
  CspNonceScope,
  getSignal,
  Ref,
  readScope,
  Scope,
  Selector,
} from './core.js';
import { Props, Fragment } from './elements.js';
import { createElement, jsxs, jsx } from './jsx.js';
/**
 * Thrown when the JavaScript call stack overflows during a render, usually
 * because the component tree is too deep. `cause` is the engine's error.
 */
declare class RenderDepthError extends Error {
  readonly cause: unknown;
  constructor(cause: unknown);
}
export {
  CspNonceScope,
  type Derived,
  Fragment,
  type Props,
  RenderDepthError,
  type Ref,
  type RenderDiagnosticsOptions,
  type RenderableChild,
  type Scope,
  type Selector,
  type State,
  type StateSetter,
  type StateTuple,
  configureRenderDiagnostics,
  createElement,
  createRef,
  cspNonce,
  defineScope,
  derive,
  getSignal,
  jsx,
  jsxs,
  readScope,
  registerSSRStyle,
  selector,
  state,
};
