/**
 * The hook kit: what a primitive built on the core (data queries, route
 * activity, lifecycle helpers) uses to own state across renders.
 *
 * A hook claims a positional slot in the current component, keeps its state
 * in that slot, registers work that runs after the render commits, and ties
 * cleanup to the component's lifetime. Readable sources let a hook's state
 * participate in the reactive graph.
 */

import type { AppRenderRuntime } from '../../common/app-render-runtime';
import { reportUncaughtError } from '../../common/report-error';
import { deliverToBoundary } from '../component/errors';
import {
  ComponentInstance,
  claimHook,
  getCurrentInstance,
} from '../component/instance';
import { Owner, getOwner, runWithOwner, type Cleanup } from '../reactive/owner';
import { notifySource, trackSource, type Source } from '../reactive/graph';

export type { ComponentInstance, Cleanup };

export function currentComponent(): ComponentInstance | null {
  return getCurrentInstance();
}

/**
 * Claim the next slot of `instance` for a hook of `kind`, creating its state
 * on the first render. Later renders get the same state back.
 */
export function hookSlot<T>(
  instance: ComponentInstance,
  kind: string,
  create: () => T
): T {
  const index = claimHook(instance, kind);
  if (!(index in instance.hooks)) instance.hooks[index] = create();
  return instance.hooks[index] as T;
}

/** The index the next hook claim would use (for keyed per-slot stores). */
export function claimHookIndex(
  instance: ComponentInstance,
  kind: string
): number {
  return claimHook(instance, kind);
}

/** Run `fn` after the current render of `instance` commits. */
export function onCommit(
  instance: ComponentInstance,
  fn: () => void | Cleanup | PromiseLike<unknown>
): void {
  instance.onCommit(() => {
    const result = fn();
    if (typeof result === 'function') return result as Cleanup;
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      Promise.resolve(result).then(
        (cleanup) => {
          if (typeof cleanup === 'function')
            instance.onCleanup(cleanup as Cleanup);
        },
        (error) => reportLifecycleError(instance, error)
      );
    }
    return undefined;
  });
}

/** Run `fn` when `owner`'s lifetime ends (immediately if it already has). */
export function onDispose(owner: Owner, fn: Cleanup): void {
  owner.onCleanup(fn);
}

/** The owner whose lifetime callbacks and handlers currently run under. */
export function currentOwner(): Owner | null {
  return getOwner();
}

export function withOwner<T>(owner: Owner | null, fn: () => T): T {
  return runWithOwner(owner, fn);
}

/** Deliver a lifecycle failure to the nearest error boundary, else report it. */
export function reportLifecycleError(
  owner: Owner | null,
  error: unknown
): void {
  if (!deliverToBoundary(owner, error)) reportUncaughtError(error);
}

// ---------------------------------------------------------------------------
// Readable sources

export interface ReadableSource {
  _observers: Source['_observers'];
}

export function createSource(): ReadableSource {
  return { _observers: null };
}

/** Record that the running computation read `source`. */
export function readSource(source: ReadableSource): void {
  trackSource(source);
}

/** Tell everything that read `source` that it changed. */
export function notify(source: ReadableSource): void {
  notifySource(source);
}

// ---------------------------------------------------------------------------
// Application runtime

const APP_RUNTIME = Symbol('askr.app-runtime');

/** Make `runtime` visible to everything rendered under `owner`. */
export function provideAppRuntime(
  owner: Owner,
  runtime: AppRenderRuntime
): void {
  (owner.context ??= new Map()).set(APP_RUNTIME, runtime);
}

export function currentAppRuntime(): AppRenderRuntime | undefined {
  return getOwner()?.lookup(APP_RUNTIME) as AppRenderRuntime | undefined;
}

/** Run `fn` with `runtime` as the current application runtime. */
export function withAppRuntime<T>(
  runtime: AppRenderRuntime | undefined,
  fn: () => T
): T {
  if (!runtime) return fn();
  const owner = new Owner(null);
  owner.parent = getOwner();
  provideAppRuntime(owner, runtime);
  return runWithOwner(owner, fn);
}
