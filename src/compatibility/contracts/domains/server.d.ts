import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { RenderableChild, Scope } from './context.js';

/**
 * Common call contracts: SSR types
 */
/** Arbitrary serializable data attached to an SSR render pass (e.g. loader output). */
type SSRData = Record<string, unknown>;

/** Styles produced while rendering a request, kept with that request's SSR context. */
interface SSRStyleRegistration {
  id: string;
  cssText: string;
}

interface DocumentRenderRoute {
  path: string;
  namespace?: string;
}

/** Request/render metadata passed to a {@link DocumentRenderer}. */
interface DocumentRenderContext {
  mode: 'ssr' | 'ssg';
  url: string;
  pathname: string;
  search: string;
  hash: string;
  params: Record<string, string>;
  data?: SSRData;
  seed: number;
  route: DocumentRenderRoute;
  cspNonce?: string;
  styles?: readonly SSRStyleRegistration[];
}

/** Arguments passed to a {@link DocumentRenderer}: the rendered app HTML and its context. */
interface DocumentRenderArgs {
  appHtml: string;
  context: DocumentRenderContext;
}

/** Wraps rendered app HTML in a full document (`<html>`, `<head>`, etc.) for SSR/SSG output. */
type DocumentRenderer = (args: DocumentRenderArgs) => string;

/** How to react when SSR styles were registered but not included in the rendered document. */
type SSRStyleRegistrationValidation = 'warn' | 'error' | 'off';

/** Full context for sink-based streaming SSR */
type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};

/** Lexical scope carrying the CSP nonce for the current render, if any. */
declare const CspNonceScope: Scope<string | undefined>;

/**
 * Read the CSP nonce for the current render from {@link CspNonceScope}.
 *
 * @returns The active nonce, or `undefined` when called outside of a
 * component render or when no nonce was configured.
 */
declare function cspNonce(): string | undefined;

interface DeferredBoundaryRegistration {
  id: string;
  promise: Promise<unknown>;
  fulfilled(value: unknown): RenderableChild;
  rejected(error: unknown): RenderableChild;
}

interface SSRPortalHostRegistration {
  token: string;
  automatic: boolean;
}

interface SSRPortalSlot {
  hasValue: boolean;
  value: RenderableChild | undefined;
  hosts: SSRPortalHostRegistration[];
}

interface SSRPortalState {
  slots: Map<object, SSRPortalSlot>;
  nextHostId: number;
}

/** Register request-local CSS produced during SSR without importing the SSR renderer in clients. */
declare function registerSSRStyle(id: string, cssText: string): void;
export {
  SSRData,
  SSRStyleRegistration,
  DocumentRenderRoute,
  DocumentRenderContext,
  DocumentRenderArgs,
  DocumentRenderer,
  SSRStyleRegistrationValidation,
  SSRContext,
  CspNonceScope,
  cspNonce,
  DeferredBoundaryRegistration,
  SSRPortalHostRegistration,
  SSRPortalSlot,
  SSRPortalState,
  registerSSRStyle,
};
