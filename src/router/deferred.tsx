import {
  getActiveRenderContext,
  getCurrentRenderData,
  registerDeferredBoundary,
} from '../common/render-context';
import { currentAppRuntime as getCurrentAppRenderRuntime } from '../core/api/hooks';
import type { RenderableChild } from '../common/vnode';
import type { RouteContext } from '../common/router';
import type { JSXElement } from '../common/jsx';
import { resource } from '../core/api/resource';
import { guardHydratedRouteData } from './route-hydration';
import {
  defer,
  DEFERRED_BOUNDARY,
  isDeferred,
  reviveDeferredValue,
  type Deferred,
  type DeferredState,
} from '../common/deferred-value';

export { defer, DEFERRED_BOUNDARY, isDeferred, reviveDeferredValue };
export type { Deferred, DeferredState };

/** Props for {@link Resolve}. */
export interface ResolveProps<T> {
  value: Deferred<T>;
  pending?: RenderableChild;
  rejected?: RenderableChild | ((error: unknown) => RenderableChild);
  children: (value: T) => RenderableChild;
}

export interface DeferredBoundaryNode {
  type: typeof DEFERRED_BOUNDARY;
  props: { id: string; pending: RenderableChild };
}

function abortError(): Error {
  const error = new Error('Deferred route data was aborted.');
  error.name = 'AbortError';
  return error;
}

function awaitWithSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
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

/** Recursively await any {@link Deferred} values nested within `input`, returning it once fully resolved. */
export async function resolveDeferredValues<T>(
  input: T,
  signal?: AbortSignal
): Promise<T> {
  const seen = new Set<object>();

  const visit = async (value: unknown): Promise<void> => {
    if (!value || typeof value !== 'object') return;
    if (isDeferred(value)) {
      const resolved = await awaitWithSignal(value.promise, signal);
      await visit(resolved);
      return;
    }
    if (seen.has(value)) return;
    seen.add(value);
    const children = Array.isArray(value)
      ? value
      : Object.values(value as Record<string, unknown>);
    await Promise.all(children.map(visit));
  };

  await visit(input);
  return input;
}

/** Read the current route's server loader data during render or hydration. */
export function routeData<T>(): T {
  const envelope = getCurrentRenderData();
  if (envelope)
    return guardHydratedRouteData(envelope.route, envelope.framework) as T;
  const runtime = getCurrentAppRenderRuntime();
  if (!runtime?.hasRoute) {
    throw new Error(
      'routeData() can only be read while rendering a route with loader data.'
    );
  }
  return guardHydratedRouteData(runtime.route, runtime.framework) as T;
}

/**
 * Read the result of a `group()`/`page()` loader while rendering a route that
 * runs it, typically from a layout or page host. The argument is the loader
 * function declared on the scope, so the read is typed by that function and
 * works anywhere below the scope, including the leaf.
 */
export function layoutData<TData>(
  loader: (
    context: RouteContext & { request?: Request }
  ) => TData | PromiseLike<TData>
): TData {
  const values =
    getActiveRenderContext()?.layoutData ??
    getCurrentAppRenderRuntime()?.layoutData;
  if (!values?.has(loader)) {
    throw new Error(
      'layoutData() can only read a group() or page() loader of the route being rendered.'
    );
  }
  return values.get(loader) as TData;
}

function rejectedChild<T>(
  props: ResolveProps<T>,
  error: unknown
): RenderableChild {
  return typeof props.rejected === 'function'
    ? props.rejected(error)
    : (props.rejected ?? null);
}

/** Render a {@link Deferred} value's fulfilled state, a pending placeholder, or a rejected fallback. */
export function Resolve<T>(props: ResolveProps<T>): JSXElement {
  const renderContext = getActiveRenderContext();
  // On the client the resource hook is claimed on every render, so the render
  // after the deferred value settles keeps the same hook order.
  const result = renderContext
    ? null
    : resource(
        () => (props.value.state === 'pending' ? props.value.promise : null),
        [props.value]
      );
  if (props.value.state === 'fulfilled') {
    return props.children(props.value.value as T) as unknown as JSXElement;
  }
  if (props.value.state === 'rejected') {
    return rejectedChild(props, props.value.error) as unknown as JSXElement;
  }
  if (renderContext) {
    const id = registerDeferredBoundary(renderContext, {
      promise: props.value.promise,
      fulfilled: (value) => props.children(value as T),
      rejected: (error) => rejectedChild(props, error),
    });
    return {
      type: DEFERRED_BOUNDARY,
      props: { id, pending: props.pending ?? null },
    } as unknown as JSXElement;
  }

  if (!result) return (props.pending ?? null) as unknown as JSXElement;
  if (result.error)
    return rejectedChild(props, result.error) as unknown as JSXElement;
  if (result.pending || result.value === null)
    return (props.pending ?? null) as unknown as JSXElement;
  return props.children(result.value) as unknown as JSXElement;
}
