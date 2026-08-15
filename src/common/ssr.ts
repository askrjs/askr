/**
 * Common call contracts: SSR types
 */

/** Arbitrary serializable data attached to an SSR render pass (e.g. loader output). */
export type SSRData = Record<string, unknown>;

/** Styles produced while rendering a request, kept with that request's SSR context. */
export interface SSRStyleRegistration {
  id: string;
  cssText: string;
}

export interface DocumentRenderRoute {
  path: string;
  namespace?: string;
}

/** Request/render metadata passed to a {@link DocumentRenderer}. */
export interface DocumentRenderContext {
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
export interface DocumentRenderArgs {
  appHtml: string;
  context: DocumentRenderContext;
}

/** Wraps rendered app HTML in a full document (`<html>`, `<head>`, etc.) for SSR/SSG output. */
export type DocumentRenderer = (args: DocumentRenderArgs) => string;

/** How to react when SSR styles were registered but not included in the rendered document. */
export type SSRStyleRegistrationValidation = 'warn' | 'error' | 'off';

function escapedStyleRawText(value: string): string {
  return value.replace(/<\//gi, '<\\/');
}

function validateDocumentStyleRegistrations(
  html: string,
  styles: readonly SSRStyleRegistration[] | undefined,
  apiName: string,
  validation: SSRStyleRegistrationValidation
): void {
  if (validation === 'off' || !styles || styles.length === 0) return;

  const dropped = styles.filter(
    ({ cssText }) =>
      !html.includes(cssText) && !html.includes(escapedStyleRawText(cssText))
  );
  if (dropped.length === 0) return;

  const registrations = dropped.map(({ id }) => JSON.stringify(id)).join(', ');
  const message =
    `${apiName} document() dropped ${dropped.length} registered SSR style` +
    `${dropped.length === 1 ? '' : 's'}: ${registrations}. ` +
    'Serialize context.styles into the returned document, or set ' +
    'styleRegistrationValidation to "off" when omission is intentional.';

  if (validation === 'error') throw new Error(message);
  console.warn(message);
}

export function renderDocument(
  document: DocumentRenderer,
  args: DocumentRenderArgs,
  apiName: string,
  styleRegistrationValidation: SSRStyleRegistrationValidation = 'warn'
): string {
  const html: unknown = document(args);

  if (typeof html !== 'string') {
    const isPromiseLike =
      typeof html === 'object' &&
      html !== null &&
      'then' in html &&
      typeof html.then === 'function';
    const received = isPromiseLike
      ? 'a Promise-like value'
      : html === null
        ? 'null'
        : Array.isArray(html)
          ? 'an array'
          : typeof html;

    throw new Error(
      `${apiName} document() must synchronously return a string; received ${received}.`
    );
  }

  validateDocumentStyleRegistrations(
    html,
    args.context.styles,
    apiName,
    styleRegistrationValidation
  );
  return html;
}

export const SSR_RENDER_DATA_ATTR = 'data-askr-render-data';

/** Full context for sink-based streaming SSR */
export type SSRContext = {
  url: string;
  seed: number;
  data?: SSRData;
  params?: Record<string, string>;
  signal?: AbortSignal;
};

/** Lightweight context for synchronous render passes */
export type RenderContext = {
  seed: number;
};
