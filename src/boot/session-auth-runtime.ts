import type { RouteAuthOptions } from '../common/router';
import { reportUncaughtErrorLater } from '../common/report-error';
import { createDataRuntime, disposeDataRuntime } from '../data/data-runtime';
import type { DataRuntime } from '../data/types';
import {
  getSessionAuthState,
  markSessionRootInvalidated,
  type SessionAuthState,
} from '../router/session-auth-state';
import type { AppRoot } from './root-lifecycle';

const owned = new WeakSet<DataRuntime>();
const attachments = new WeakMap<
  AppRoot,
  {
    state: SessionAuthState;
    replace(runtime: DataRuntime): void;
    detach(): void;
  }
>();

/** Session-bound browser roots always own isolated, disposable private data. */
export function sessionDataRuntime(
  auth: RouteAuthOptions | undefined,
  supplied: DataRuntime | undefined
): DataRuntime | undefined {
  if (!getSessionAuthState(auth)) return supplied;
  if (supplied)
    throw new TypeError(
      '[Askr] Session auth owns its data runtime; omit dataRuntime.'
    );
  const runtime = createDataRuntime();
  owned.add(runtime);
  return runtime;
}

export function releaseSessionDataRuntime(runtime: DataRuntime): void {
  if (owned.delete(runtime)) disposeDataRuntime(runtime);
}

/** Boot attaches before rendering; no app-specific mount/cleanup glue. */
export function attachSessionAuthRoot(
  app: AppRoot,
  abortRoot: () => void
): void {
  const state = getSessionAuthState(app.appRuntime?.routeAuth);
  const previous = attachments.get(app);
  if (previous?.state === state) {
    if (state && app.appRuntime?.dataRuntime)
      previous!.replace(app.appRuntime.dataRuntime);
    return;
  }
  previous?.detach();
  if (!state) return;
  let runtime = app.appRuntime?.dataRuntime;
  let active = true;
  if (!runtime || !owned.has(runtime)) {
    throw new TypeError(
      '[Askr] Session auth requires its boot-owned data runtime.'
    );
  }
  const detachState = state.attach(app, () => {
    if (!active) return;
    const old = runtime!;
    runtime = createDataRuntime();
    owned.add(runtime);
    // Changing exact appRuntime identity also fences old route continuations.
    app.appRuntime = {
      ...app.appRuntime!,
      dataRuntime: runtime,
      hydrationResources: undefined,
      framework: Object.freeze({}),
      route: undefined,
      hasRoute: false,
    };
    markSessionRootInvalidated(app);
    // Private route DOM and component state must disappear before revalidation.
    const errors: unknown[] = [];
    let failedRender = false;
    try {
      app.root.render(null);
    } catch (error) {
      errors.push(error);
      failedRender = true;
    }
    try {
      releaseSessionDataRuntime(old);
    } catch (error) {
      errors.push(error);
    }
    // A failed DOM commit must never restore an authenticated subtree after
    // its authority changed. Remove the failed app rather than retaining it.
    if (failedRender) {
      try {
        abortRoot();
      } catch (error) {
        errors.push(error);
      }
      // Native removal is the final privacy fallback if a transactional DOM
      // write failed. End this attachment even if ordinary teardown also failed.
      try {
        app.element.replaceChildren();
      } catch (error) {
        errors.push(error);
      }
      detach();
    }
    if (errors.length)
      throw new AggregateError(errors, '[Askr] Session data cleanup failed.');
  });
  const detach = () => {
    if (attachments.get(app)?.detach !== detach) return;
    attachments.delete(app);
    active = false;
    app.callbacks.delete(detach);
    try {
      releaseSessionDataRuntime(runtime!);
    } catch (error) {
      reportUncaughtErrorLater(error);
    }
    detachState();
  };
  attachments.set(app, {
    state,
    detach,
    replace(next) {
      if (!owned.has(next))
        throw new TypeError(
          '[Askr] Session auth requires its boot-owned data runtime.'
        );
      if (runtime === next) return;
      const old = runtime!;
      runtime = next;
      try {
        releaseSessionDataRuntime(old);
      } catch (error) {
        reportUncaughtErrorLater(error);
      }
    },
  });
  app.callbacks.add(detach);
}

/** Release a failed boot even if host DOM teardown prevented normal callbacks. */
export function detachSessionAuthRoot(app: AppRoot): void {
  attachments.get(app)?.detach();
}

export function isSessionDataRuntime(runtime: DataRuntime): boolean {
  return owned.has(runtime);
}

/** Own private data and cross-tab invalidation while initial routing is pending. */
export function beginSessionAuthBoot(
  auth: RouteAuthOptions | undefined,
  runtime: DataRuntime,
  clearMarkup?: () => void
): {
  signal: AbortSignal;
  assertCurrent(): void;
  wait<T>(value: T | PromiseLike<T>): Promise<T>;
  stale(): boolean;
  restart(): boolean;
  detach(): void;
} {
  const state = getSessionAuthState(auth);
  const controller = new AbortController();
  const check = state?.capture();
  const detach = state?.attach(
    {},
    () => {
      controller.abort();
      try {
        clearMarkup?.();
      } finally {
        releaseSessionDataRuntime(runtime);
      }
    },
    false
  );
  const assertCurrent = () => {
    if (controller.signal.aborted)
      throw new DOMException(
        'The session operation was cancelled.',
        'AbortError'
      );
    check?.();
  };
  return {
    signal: controller.signal,
    assertCurrent,
    wait<T>(value: T | PromiseLike<T>): Promise<T> {
      const promise = Promise.resolve(value);
      try {
        assertCurrent();
      } catch (error) {
        void promise.catch(() => {});
        return Promise.reject(error);
      }
      if (!state) return promise;
      return new Promise<T>((resolve, reject) => {
        const cancel = () =>
          reject(
            new DOMException(
              'The session operation was cancelled.',
              'AbortError'
            )
          );
        controller.signal.addEventListener('abort', cancel, { once: true });
        promise.then(
          (result) => {
            controller.signal.removeEventListener('abort', cancel);
            try {
              assertCurrent();
              resolve(result);
            } catch (error) {
              reject(error);
            }
          },
          (error) => {
            controller.signal.removeEventListener('abort', cancel);
            reject(error);
          }
        );
      });
    },
    stale: () => controller.signal.aborted,
    restart: () => controller.signal.aborted && !state?.isDocumentRecovery(),
    // A boot lease transfers ownership; it must not erase a newer logout or
    // cross-tab invalidation while the replacement boot is starting.
    detach: () => detach?.(true),
  };
}
