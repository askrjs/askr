import {
  getActiveRenderContext,
  getCurrentRenderData,
} from '../common/render-context';
import { getCurrentAppRenderRuntime } from '../runtime';
import type { RenderableChild } from '../common/vnode';
import type { JSXElement } from '../common/jsx';
import { resource } from '../runtime';

const DEFERRED_VALUE = Symbol.for('@askrjs/askr/deferred-value');
export const DEFERRED_BOUNDARY = Symbol.for('@askrjs/askr/deferred-boundary');

export type DeferredState = 'pending' | 'fulfilled' | 'rejected';

export interface Deferred<T> {
  readonly state: DeferredState;
  readonly value: T | undefined;
  readonly error: unknown;
  readonly promise: Promise<T>;
  readonly [DEFERRED_VALUE]: true;
}

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

export function defer<T>(promise: PromiseLike<T>): Deferred<T> {
  let state: DeferredState = 'pending';
  let value: T | undefined;
  let error: unknown;
  const normalized = Promise.resolve(promise);
  void normalized.then(
    (resolved) => {
      state = 'fulfilled';
      value = resolved;
    },
    (reason) => {
      state = 'rejected';
      error = reason;
    }
  );

  return Object.freeze(
    Object.defineProperties(
      {},
      {
        state: { enumerable: true, get: () => state },
        value: { enumerable: true, get: () => value },
        error: { enumerable: true, get: () => error },
        promise: { value: normalized },
        [DEFERRED_VALUE]: { value: true },
      }
    )
  ) as Deferred<T>;
}

export function isDeferred<T = unknown>(value: unknown): value is Deferred<T> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Partial<Deferred<T>>)[DEFERRED_VALUE] === true
  );
}

/** @internal Reconstruct settled server data without starting loader work. */
export function reviveDeferredValue<T>(
  state: 'fulfilled' | 'rejected',
  value: T | undefined,
  error: unknown
): Deferred<T> {
  const promise =
    state === 'fulfilled' ? Promise.resolve(value as T) : Promise.reject(error);
  if (state === 'rejected') void promise.catch(() => undefined);
  return Object.freeze(
    Object.defineProperties(
      {},
      {
        state: { enumerable: true, value: state },
        value: { enumerable: true, value },
        error: { enumerable: true, value: error },
        promise: { value: promise },
        [DEFERRED_VALUE]: { value: true },
      }
    )
  ) as Deferred<T>;
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

export function routeData<T>(): T {
  const envelope = getCurrentRenderData();
  if (envelope) return envelope.route as T;
  const runtime = getCurrentAppRenderRuntime();
  if (!runtime?.hasRoute) {
    throw new Error(
      'routeData() can only be read while rendering a route with loader data.'
    );
  }
  return runtime.route as T;
}

function rejectedChild<T>(
  props: ResolveProps<T>,
  error: unknown
): RenderableChild {
  return typeof props.rejected === 'function'
    ? props.rejected(error)
    : (props.rejected ?? null);
}

export function Resolve<T>(props: ResolveProps<T>): JSXElement {
  if (props.value.state === 'fulfilled') {
    return props.children(props.value.value as T) as unknown as JSXElement;
  }
  if (props.value.state === 'rejected') {
    return rejectedChild(props, props.value.error) as unknown as JSXElement;
  }
  const renderContext = getActiveRenderContext();
  if (renderContext) {
    const id = `d:${renderContext.deferredBoundaries.length}`;
    renderContext.deferredBoundaries.push({
      id,
      promise: props.value.promise,
      fulfilled: (value) => props.children(value as T),
      rejected: (error) => rejectedChild(props, error),
    });
    return {
      type: DEFERRED_BOUNDARY,
      props: { id, pending: props.pending ?? null },
    } as unknown as JSXElement;
  }

  const result = resource(() => props.value.promise, [props.value]);
  if (result.error)
    return rejectedChild(props, result.error) as unknown as JSXElement;
  if (result.pending || result.value === null)
    return (props.pending ?? null) as unknown as JSXElement;
  return props.children(result.value) as unknown as JSXElement;
}
