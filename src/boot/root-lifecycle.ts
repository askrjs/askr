/**
 * Application roots: one per mounted container element.
 *
 * An application root owns a core render root, its application runtime (route
 * data, data runtime), its default portal, and its cleanup callbacks. The
 * rendered tree is `RootView`, which provides the application runtime and
 * renders the current route handler followed by the automatic default portal
 * host. A new route lifetime is a new `RootView` key.
 */

import type { AppRenderRuntime } from '../common/app-render-runtime';
import type { AppRootHandle } from '../common/app-root';
import type { ComponentFunction } from '../common/component';
import { ELEMENT_TYPE, type JSXElement } from '../common/jsx';
import { reportUncaughtErrorLater } from '../common/report-error';
import { provideAppRuntime } from '../core/api/hooks';
import { provideDefaultPortal } from '../core/api/portal';
import { createRoot, type Root } from '../core/dom/root';
import { flushSync } from '../core/reactive/scheduler';
import { validateCspNonce } from '../csp-nonce';
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
    provideDefaultPortal(this.root.owner);
    this.component = component;
    this.handler = component;
  }

  view(): JSXElement {
    return {
      $$typeof: ELEMENT_TYPE,
      type: RootView,
      props: { handler: this.handler, runtime: this.appRuntime },
      key: this.generation,
    } as unknown as JSXElement;
  }
}

interface RootViewProps {
  handler: ComponentFunction;
  runtime: AppRenderRuntime | undefined;
}

function RootView(props: RootViewProps, context?: unknown): unknown {
  provideAppRuntime(props.runtime);
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
        if (value === '' && appRoots.get(this) === app) disposeAppRoot(app);
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
  flushSync();
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

/** Deferred hydration boundaries are not supported by this renderer yet. */
export function activateHydrationBoundary(
  _rootElement: Element,
  _boundary: Element
): boolean {
  return false;
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

/** Check whether an app is currently mounted at `root`. */
export function hasApp(root: Element | string): boolean {
  const rootElement = resolveRootElement(root);
  return rootElement ? appRoots.has(rootElement) : false;
}
