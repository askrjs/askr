/**
 * Application roots: one per mounted container element.
 *
 * An application root owns a core render root, its application runtime (route
 * data, data runtime), its default portal, and its cleanup callbacks. The
 * rendered tree is `RootView`, which provides the application runtime and
 * renders the current route handler followed by the automatic default portal
 * host. The root view keeps shared route shells in place across navigation.
 */

import { clarifyRenderOverflow } from '../common/render-depth';
import {
  createAppRenderRuntime,
  type AppRenderRuntime,
} from '../common/app-render-runtime';
import type { AppRootHandle } from '../common/app-root';
import type { ComponentFunction } from '../common/component';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import { reportUncaughtErrorLater } from '../common/report-error';
import { currentComponent, provideAppRuntime } from '../core/api/hooks';
import { provideDefaultPortal } from '../core/api/portal';
import { dormantHostFor, hydrateDormantHost } from '../core/dom/nodes';
import { Pass } from '../core/dom/pass';
import { createRoot, type Root } from '../core/dom/root';
import { ROOT, type Parent } from '../core/dom/tree';
import { flushSync } from '../core/reactive/scheduler';
import { validateCspNonce } from '../csp-nonce';
import {
  assertDataRuntimeActive,
  findDataRuntimeState,
} from '../data/data-runtime';
import type { DataRuntime } from '../data/types';
import {
  initializeNavigation,
  registerAppInstance,
  unregisterAppInstance,
} from '../router/navigate';
import { clearRouteState } from '../router/store';
import { ensureBrowserRuntime } from './composition';
import { resolveRootElement } from './root-element';
import { wrapRootRouteHandler } from './root-handler';
import type { BootAppRouteSource } from './types';

export class AppRoot implements AppRootHandle {
  readonly element: Element;
  readonly root: Root;
  appRuntime: AppRenderRuntime | undefined;
  cspNonce: string | undefined;
  cleanupStrict = false;
  /** The route handler as supplied, before wrapping. */
  component: ComponentFunction;
  handler: ComponentFunction;
  /** Changes when the route lifetime is replaced. */
  generation = 0;
  routed = false;
  readonly callbacks = new Set<() => void>();

  constructor(
    element: Element,
    component: ComponentFunction,
    hydrate: boolean
  ) {
    this.element = element;
    this.root = createRoot(element, { owner: null, hydrate });
    provideDefaultPortal(this.root.owner, element);
    this.component = component;
    this.handler = component;
  }

  view(): JSXElement {
    return {
      $$typeof: ELEMENT_TYPE,
      type: RootView,
      props: { handler: this.handler, runtime: this.appRuntime },
      key: this.routed ? 0 : this.generation,
    } as unknown as JSXElement;
  }
}

interface RootViewProps {
  handler: ComponentFunction;
  runtime: AppRenderRuntime | undefined;
}

function RootView(props: RootViewProps, context?: unknown): unknown {
  provideAppRuntime(props.runtime);
  // The handler runs inline; diagnostics name its hooks after it.
  const instance = currentComponent();
  if (instance) instance.name = props.handler.name || null;
  return props.handler({}, context as never);
}

const appRoots = new WeakMap<Element, AppRoot>();
let routedRootCount = 0;

export function getAppRoot(element: Element): AppRoot | undefined {
  return appRoots.get(element);
}

export function registerRootCleanupCallback(
  rootElement: Element,
  callback: () => void
): () => void {
  const app = appRoots.get(rootElement);
  if (!app) return () => {};
  app.callbacks.add(callback);
  return () => app.callbacks.delete(callback);
}

function disposeAppRoot(app: AppRoot): void {
  if (appRoots.get(app.element) !== app) return;
  appRoots.delete(app.element);
  restoreInnerHTML(app.element);
  const errors = app.root.dispose();
  for (const callback of Array.from(app.callbacks)) {
    try {
      callback();
    } catch (error) {
      errors.push(error);
    }
  }
  app.callbacks.clear();
  unregisterAppInstance(app);
  if (app.routed) {
    app.routed = false;
    routedRootCount--;
    if (routedRootCount === 0) clearRouteState();
  }
  if (errors.length === 0) return;
  if (app.cleanupStrict) {
    throw new AggregateError(errors, 'cleanup failed for app root');
  }
  reportUncaughtErrorLater(
    errors.length === 1
      ? errors[0]
      : new AggregateError(errors, 'cleanup failed for app root')
  );
}

/**
 * Clearing a root's markup with `innerHTML = ''` tears the app down first,
 * so its lifetimes end with the DOM they own.
 */
function interceptInnerHTML(app: AppRoot): void {
  const element = app.element;
  const descriptor =
    Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML') ??
    Object.getOwnPropertyDescriptor(
      Object.getPrototypeOf(element),
      'innerHTML'
    );
  if (!descriptor?.set || !descriptor.get) return;
  try {
    Object.defineProperty(element, 'innerHTML', {
      configurable: true,
      get(this: Element) {
        return descriptor.get!.call(this);
      },
      set(this: Element, value: string) {
        if (value === '' && appRoots.get(this) === app) {
          disposeAppRoot(app);
          if (appRoots.has(this)) return;
        }
        descriptor.set!.call(this, value);
      },
    });
  } catch {
    // A frozen element keeps the native accessor.
  }
}

function restoreInnerHTML(element: Element): void {
  if (Object.prototype.hasOwnProperty.call(element, 'innerHTML')) {
    Reflect.deleteProperty(element, 'innerHTML');
  }
}

export interface MountOptions {
  cleanupStrict?: boolean;
  appRuntime?: AppRenderRuntime;
  cspNonce?: string;
  /** The container holds server-rendered markup for this app to adopt. */
  hydrate?: boolean;
  /** Runs after the render commits, before the work it scheduled flushes. */
  onCommit?: () => void;
}

/** Mount `component` at `rootElement`, or re-render the app already there. */
export function mountOrUpdate(
  rootElement: Element,
  component: ComponentFunction,
  options?: MountOptions
): AppRoot {
  ensureBrowserRuntime();
  const nonce = validateCspNonce(options?.cspNonce);
  let app = appRoots.get(rootElement);
  const replacingIsland =
    app !== undefined && app.component !== component && !app.routed;
  if (!app) {
    app = new AppRoot(rootElement, component, options?.hydrate === true);
    appRoots.set(rootElement, app);
    interceptInnerHTML(app);
  } else if (app.component !== component) {
    // A different component starts fresh state.
    app.generation++;
  }
  app.component = component;
  app.handler = wrapRootRouteHandler(component, nonce);
  app.cspNonce = nonce;
  app.appRuntime = options?.appRuntime;
  if (typeof options?.cleanupStrict === 'boolean') {
    app.cleanupStrict = options.cleanupStrict;
  }
  app.root.render(app.view());
  options?.onCommit?.();
  flushSync();
  if (replacingIsland) {
    const callbacks = Array.from(app.callbacks);
    app.callbacks.clear();
    const errors: unknown[] = [];
    for (const callback of callbacks) {
      try {
        callback();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length > 0) {
      if (app.cleanupStrict) {
        throw new AggregateError(errors, 'cleanup failed for app root');
      }
      reportUncaughtErrorLater(
        errors.length === 1
          ? errors[0]
          : new AggregateError(errors, 'cleanup failed for app root')
      );
    }
  }
  return app;
}

export async function registerAppNavigation(
  rootElement: Element,
  path: string,
  source: BootAppRouteSource
): Promise<void> {
  ensureBrowserRuntime();
  const app = appRoots.get(rootElement);
  if (!app) throw new Error('Internal error: app instance missing');
  if (!app.routed) {
    app.routed = true;
    routedRootCount++;
  }
  registerAppInstance(app, path, source);
  initializeNavigation();
}

export function activateHydrationBoundary(
  rootElement: Element,
  boundary: Element
): boolean {
  const app = appRoots.get(rootElement);
  if (!app || !rootElement.contains(boundary)) return false;
  const host = dormantHostFor(boundary);
  if (!host) return false;
  let parent: Parent | null = host.parent;
  while (parent && parent.kind !== ROOT) parent = parent.parent;
  if (parent !== app.root.node) return false;

  const pass = new Pass();
  try {
    pass.run(() => hydrateDormantHost(pass, host));
  } catch (error) {
    for (const failure of pass.discard()) reportUncaughtErrorLater(failure);
    throw clarifyRenderOverflow(error);
  }
  pass.commit();
  flushSync();
  return true;
}

/**
 * Tear down the app mounted at `root`: its content, lifetimes, and cleanup
 * callbacks, and its route registration.
 */
export function cleanupApp(root: Element | string): void {
  const rootElement = resolveRootElement(root);
  if (!rootElement) return;
  const app = appRoots.get(rootElement);
  if (app) disposeAppRoot(app);
}

/** Replace a mounted app's data owner without replacing its component lifetime. */
export function replaceDataRuntime(
  root: Element | string,
  next: DataRuntime
): void {
  const rootElement = resolveRootElement(root);
  const app = rootElement ? appRoots.get(rootElement) : undefined;
  if (!app)
    throw new Error('[Askr] replaceDataRuntime requires a mounted app root.');
  const state = findDataRuntimeState(next);
  if (!state)
    throw new Error(
      '[Askr] data runtime was not created by createDataRuntime().'
    );
  assertDataRuntimeActive(state);
  const previous = app.appRuntime;
  if (previous?.dataRuntime === next) return;
  app.appRuntime = previous
    ? { ...previous, dataRuntime: next }
    : createAppRenderRuntime({ dataRuntime: next });
  let prepared: ReturnType<Root['prepare']> | undefined;
  try {
    prepared = app.root.prepare(app.view());
    prepared.apply();
  } catch (error) {
    app.appRuntime = previous;
    throw error;
  }
  try {
    prepared.publish();
  } catch (error) {
    if (prepared.aborted) app.appRuntime = previous;
    throw error;
  }
  flushSync();
}

/** Check whether an app is currently mounted at `root`. */
export function hasApp(root: Element | string): boolean {
  const rootElement = resolveRootElement(root);
  return rootElement ? appRoots.has(rootElement) : false;
}
