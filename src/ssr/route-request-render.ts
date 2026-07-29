import type { AuthContext } from '@askrjs/auth';
import type {
  AccessDenyDecision,
  AccessRedirectDecision,
  RouteAuthOptions,
  RouteRegistry,
} from '../common/router';
import { createDataRuntime } from '../data/data-runtime';
import { createQueryPrefetchContext } from '../data/query-registry';
import type { DataRuntime, QueryPrefetchContext } from '../data/types';
import type { ServerQueryRegistry } from '../data/query-registry';
import { resolveRouteRequest } from '../router/resolution';
import {
  createRenderContext,
  withRenderContextAsync,
  type SSRData,
} from './context';
import { renderSSRRouteAppToSink } from './render-sync';
import { renderToStringSync } from './render-sync';
import { StringSink } from './sink';
import type { CoreTelemetry } from '../common/telemetry';
import { withTelemetry } from '../common/telemetry';
import type { DeferredBoundaryRegistration } from '../common/render-context';
import { serializeHydrationRenderData } from './hydration-data';
import type { PageRenderEnvelope } from '../common/page-render-envelope';
import { validateCspNonce } from '../csp-nonce';
import type { SSRStyleRegistration } from '../common/ssr';

export interface RenderRouteRequestOptions {
  url: string;
  registry: RouteRegistry;
  auth?: RouteAuthOptions;
  authContext?: AuthContext;
  request?: Request;
  signal?: AbortSignal;
  seed?: number;
  data?: SSRData;
  /** Askr-owned state retained independently from route loader output. */
  framework?: Readonly<Record<string, unknown>>;
  dataRuntime?: DataRuntime;
  queryPrefetch?: QueryPrefetchContext;
  queryRegistry?: ServerQueryRegistry;
  telemetry?: CoreTelemetry;
  cspNonce?: string;
}

export type RenderRouteRequestResult =
  | {
      kind: 'render';
      html: string;
      stream?: ReadableStream<Uint8Array>;
      styles: readonly SSRStyleRegistration[];
      params: Record<string, string>;
      record?: import('../common/router').RouteRecord;
    }
  | AccessRedirectDecision
  | AccessDenyDecision
  | { kind: 'no-match' };

function abortError(): Error {
  const error = new Error('Deferred route rendering was aborted.');
  error.name = 'AbortError';
  return error;
}

function settleWithSignal(
  promise: Promise<unknown>,
  signal: AbortSignal
): Promise<unknown> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(abortError());
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      }
    );
  });
}

function stripHydrationPayload(html: string): string {
  return html.replace(
    /<script type="application\/json" data-askr-render-data="true">[\s\S]*?<\/script>$/,
    ''
  );
}

function renderBoundary(
  boundary: DeferredBoundaryRegistration,
  state: 'fulfilled' | 'rejected',
  payload: unknown,
  seed: number | undefined,
  data: PageRenderEnvelope | null,
  cspNonce: string | undefined
): { html: string; styles: SSRStyleRegistration[] } {
  const styles: SSRStyleRegistration[] = [];
  const html = renderToStringSync(
    () =>
      (state === 'fulfilled'
        ? boundary.fulfilled(payload)
        : boundary.rejected(payload)) as unknown as import('./types').VNode,
    {},
    {
      seed,
      envelope: data ?? undefined,
      cspNonce,
      onContext: (context) => styles.push(...context.ssrStyles.values()),
    }
  );
  return { html: stripHydrationPayload(html), styles };
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeStyleRawText(value: string): string {
  return value.replace(/<\/style/gi, '<\\/style');
}

function patchChunk(
  id: string,
  html: string,
  styles: readonly SSRStyleRegistration[],
  cspNonce: string | undefined
): string {
  const selector = `askr-resolve[data-askr-deferred=${JSON.stringify(id)}]`;
  const styleCarrier =
    styles.length === 0
      ? ''
      : `<style data-askr-style-registry="true" data-askr-deferred-style="true"${
          cspNonce ? ` nonce="${escapeHtmlAttribute(cspNonce)}"` : ''
        }>${escapeStyleRawText(styles.map((style) => style.cssText).join('\n'))}\n</style>`;
  return (
    `${styleCarrier}<template data-askr-deferred-patch="${escapeHtmlAttribute(id)}">${html}</template>` +
    `<script${cspNonce ? ` nonce="${escapeHtmlAttribute(cspNonce)}"` : ''} data-askr-deferred-apply="${escapeHtmlAttribute(id)}">(function(s){var t=s.previousElementSibling;var c=t&&t.previousElementSibling;var r=document.querySelector('style[data-askr-style-registry="true"]:not([data-askr-deferred-style])');if(c&&c.tagName==='STYLE'&&r&&r!==c){r.append(c.textContent||'');c.remove();}else if(c&&c.tagName==='STYLE'){c.removeAttribute('data-askr-deferred-style');}var b=document.querySelector(${JSON.stringify(selector)});if(b&&t){b.replaceWith(t.content.cloneNode(true));}if(t)t.remove();s.remove();})(document.currentScript)</script>`
  );
}

function createDeferredRenderStream(
  initialHtml: string,
  boundaries: readonly DeferredBoundaryRegistration[],
  signal: AbortSignal,
  seed: number | undefined,
  data: PageRenderEnvelope | null,
  runtime: DataRuntime,
  cspNonce: string | undefined
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const local = new AbortController();
  let cancelled = false;
  let closed = false;
  let initialPending = true;
  let boundaryIndex = 0;
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined;
  const cleanup = () => signal.removeEventListener('abort', abort);
  const close = (controller: ReadableStreamDefaultController<Uint8Array>) => {
    if (closed) return;
    closed = true;
    cleanup();
    controller.close();
  };
  const abort = () => {
    local.abort(signal.reason);
    if (controllerRef) close(controllerRef);
  };
  signal.addEventListener('abort', abort, { once: true });

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
    async pull(controller) {
      if (cancelled || closed) return;
      if (initialPending) {
        initialPending = false;
        controller.enqueue(encoder.encode(stripHydrationPayload(initialHtml)));
        return;
      }
      const boundary = boundaries[boundaryIndex];
      if (boundary) {
        boundaryIndex += 1;
        try {
          const value = await settleWithSignal(boundary.promise, local.signal);
          if (!cancelled && !closed) {
            const rendered = renderBoundary(
              boundary,
              'fulfilled',
              value,
              seed,
              data,
              cspNonce
            );
            controller.enqueue(
              encoder.encode(
                patchChunk(
                  boundary.id,
                  rendered.html,
                  rendered.styles,
                  cspNonce
                )
              )
            );
          }
        } catch (error) {
          if (local.signal.aborted) {
            if (!cancelled && !closed) close(controller);
            return;
          }
          if (!cancelled && !closed) {
            const rendered = renderBoundary(
              boundary,
              'rejected',
              error,
              seed,
              data,
              cspNonce
            );
            controller.enqueue(
              encoder.encode(
                patchChunk(
                  boundary.id,
                  rendered.html,
                  rendered.styles,
                  cspNonce
                )
              )
            );
          }
        }
        return;
      }
      const hydration = serializeHydrationRenderData(
        data ?? undefined,
        runtime
      );
      if (hydration) controller.enqueue(encoder.encode(hydration));
      close(controller);
    },
    cancel(reason) {
      cancelled = true;
      local.abort(reason);
      cleanup();
    },
  });
}

export async function renderRouteRequest(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult> {
  return renderRouteRequestInternal(options);
}

export async function renderRouteRequestToString(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult> {
  const result = await renderRouteRequestInternal(options);
  if (result.kind !== 'render' || !result.stream) return result;
  return {
    ...result,
    html: await new Response(result.stream).text(),
    stream: undefined,
  };
}

async function renderRouteRequestInternal(
  options: RenderRouteRequestOptions
): Promise<RenderRouteRequestResult> {
  if (!options?.registry) {
    throw new TypeError('renderRouteRequest requires options.registry.');
  }

  const cspNonce = validateCspNonce(options.cspNonce);
  const manifest = options.registry.manifest;
  const signal =
    options.signal ?? options.request?.signal ?? new AbortController().signal;
  const request =
    options.request ?? new Request(new URL(options.url, 'http://localhost'));
  const runtime = options.dataRuntime ?? createDataRuntime();
  const prefetch =
    options.queryPrefetch ??
    createQueryPrefetchContext({
      runtime,
      registry: options.queryRegistry,
      request,
      signal,
      mode: 'ssr',
      telemetry: options.telemetry,
    });
  const context = createRenderContext(options.seed, {
    url: options.url,
    data: options.data,
    framework: options.framework,
    signal,
    dataRuntime: runtime,
    queryPrefetch: prefetch,
    mode: 'ssr',
    cspNonce,
  });
  return withTelemetry(options.telemetry?.ssrRender, {}, () =>
    withRenderContextAsync(context, async () => {
      const resolved = await resolveRouteRequest(options.url, {
        registry: options.registry,
        mode: 'ssr',
        auth: options.auth ?? manifest.auth,
        authContext: options.authContext,
        request,
        signal,
        telemetry: options.telemetry,
      });
      if (!resolved) return { kind: 'no-match' };
      if (resolved.kind !== 'render') return resolved;
      const sink = new StringSink();
      renderSSRRouteAppToSink({
        route: { path: '', handler: resolved.handler },
        params: resolved.params,
        data: options.data,
        ctx: context,
        sink,
      });
      sink.end();
      const html = sink.toString();
      const boundaries = [...context.deferredBoundaries];
      const result: Extract<RenderRouteRequestResult, { kind: 'render' }> = {
        kind: 'render',
        html,
        styles: Array.from(context.ssrStyles.values()),
        ...(boundaries.length > 0
          ? {
              stream: createDeferredRenderStream(
                html,
                boundaries,
                signal,
                options.seed,
                context.hydrationData,
                runtime,
                cspNonce
              ),
            }
          : {}),
        params: resolved.params,
      };
      if (resolved.record) {
        Object.defineProperty(result, 'record', {
          value: resolved.record,
          enumerable: false,
        });
      }
      return result;
    })
  );
}
