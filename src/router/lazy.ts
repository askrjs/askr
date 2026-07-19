import type {
  RouteParams,
  RouteComponent,
  RouteHandler,
  RouteRecord,
} from '../common/router';
import type { AnyRouteComponent } from './internal-types';

const pendingLazy = new Set<Promise<unknown>>();
type LazyState<TComponent extends AnyRouteComponent> = {
  factory: () => Promise<{ default: TComponent } | TComponent>;
  promise: Promise<void> | null;
  resolved: TComponent | null;
  loadError: unknown;
};
export type LazyRouteComponent<TComponent extends AnyRouteComponent> =
  TComponent & { preload(): Promise<void> };
const lazyStates = new WeakMap<
  AnyRouteComponent,
  LazyState<AnyRouteComponent>
>();
const handlerLazyComponents = new WeakMap<RouteHandler, AnyRouteComponent[]>();

function startLazyLoad(state: LazyState<AnyRouteComponent>): Promise<void> {
  if (state.promise) return state.promise;

  let promise: Promise<void>;
  promise = Promise.resolve()
    .then(state.factory)
    .then(
      (mod) => {
        state.resolved =
          typeof mod === 'function'
            ? mod
            : (mod as { default: AnyRouteComponent }).default;
      },
      (err: unknown) => {
        state.loadError = err;
      }
    )
    .finally(() => {
      pendingLazy.delete(promise);
    });
  state.promise = promise;
  pendingLazy.add(promise);
  return promise;
}

export function lazy<TComponent extends AnyRouteComponent>(
  factory: () => Promise<{ default: TComponent } | TComponent>
): LazyRouteComponent<TComponent> {
  const state: LazyState<TComponent> = {
    factory,
    promise: null,
    resolved: null,
    loadError: null,
  };
  const component = ((params: RouteParams) => {
    if (state.loadError) throw state.loadError as Error;
    if (!state.resolved) {
      throw new Error(
        'lazy() component used before it was resolved. ' +
          'Matched routes load automatically; call component.preload() for explicit preloading.'
      );
    }
    return (state.resolved as RouteComponent<RouteParams>)(params);
  }) as LazyRouteComponent<TComponent>;
  Object.defineProperty(component, 'preload', {
    value: () => startLazyLoad(state as LazyState<AnyRouteComponent>),
  });
  lazyStates.set(component, state as LazyState<AnyRouteComponent>);
  return component;
}

export function _preloadRouteRecord(record: RouteRecord): Promise<void> | null {
  const components = [
    record.component,
    ...record.pageChain.map((scope) => scope.component),
    ...record.layoutChain.map((scope) => scope.component),
  ];
  const imports = components.flatMap((component) => {
    const state = lazyStates.get(component);
    return state ? [startLazyLoad(state)] : [];
  });
  return imports.length > 0 ? Promise.all(imports).then(() => undefined) : null;
}

export function _associateLazyHandler(
  handler: RouteHandler,
  components: AnyRouteComponent[]
): void {
  handlerLazyComponents.set(handler, components);
}

export function _preloadRouteHandler(
  handler: RouteHandler
): Promise<void> | null {
  const imports = (handlerLazyComponents.get(handler) ?? []).flatMap(
    (component) => {
      const state = lazyStates.get(component);
      return state ? [startLazyLoad(state)] : [];
    }
  );
  return imports.length > 0 ? Promise.all(imports).then(() => undefined) : null;
}

export function _snapshotLazy(): Promise<unknown>[] {
  return [...pendingLazy];
}

export function _drainLazy(
  additionalPending: Iterable<Promise<unknown>> = []
): Promise<void> {
  const combined = new Set<Promise<unknown>>([
    ...additionalPending,
    ...pendingLazy,
  ]);
  if (combined.size === 0) return Promise.resolve();
  return Promise.allSettled(combined).then(() => undefined);
}
