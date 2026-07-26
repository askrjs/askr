import type { ComponentFunction } from '../common/component';
import type { RouteAuthOptions, RouteRegistry } from '../common/router';
import { cleanupApp, createIsland, createSPA } from '../boot';
import { flushRuntimeScheduler } from '../runtime';

export interface RenderOptions {
  /**
   * Existing element to own for the duration of the render. When omitted, the
   * harness appends a managed `<div>` to `document.body`.
   */
  container?: HTMLElement;
  /** Surface lifecycle cleanup errors during unmount. */
  cleanupStrict?: boolean;
}

export interface RouteRenderOptions extends RenderOptions {
  registry: RouteRegistry;
  /** Initial path, query, and hash for the routed render. */
  url?: string;
  auth?: RouteAuthOptions;
}

export interface RenderResult {
  readonly container: HTMLElement;
  readonly root: HTMLElement;
  flush(): void;
  dispatch(
    target: EventTarget,
    event: Event | string,
    init?: EventInit
  ): boolean;
  unmount(): void;
  cleanup(): void;
}

interface RenderState {
  active: boolean;
  managed: boolean;
  restoreHistory?: History;
  restoreUrl?: string;
}

const renderStates = new WeakMap<HTMLElement, RenderState>();

function requireDocument(): Document {
  if (
    typeof document === 'undefined' ||
    typeof document.createElement !== 'function' ||
    !document.body
  ) {
    throw new Error(
      '@askrjs/askr/testing render requires a DOM environment. ' +
        'Configure Vitest with environment: "jsdom".'
    );
  }

  return document;
}

function requireWindow(): Window {
  if (
    typeof window === 'undefined' ||
    !window.location ||
    !window.history ||
    typeof window.history.replaceState !== 'function'
  ) {
    throw new Error(
      '@askrjs/askr/testing renderRoute requires a browser-like DOM environment. ' +
        'Configure Vitest with environment: "jsdom".'
    );
  }

  return window;
}

function prepareContainer(options?: RenderOptions): {
  container: HTMLElement;
  state: RenderState;
} {
  const currentDocument = requireDocument();
  const managed = options?.container === undefined;
  const providedContainer = options?.container;

  if (
    providedContainer !== undefined &&
    (!providedContainer ||
      providedContainer.nodeType !== 1 ||
      typeof providedContainer.querySelector !== 'function' ||
      typeof providedContainer.replaceChildren !== 'function')
  ) {
    throw new TypeError(
      '@askrjs/askr/testing render options.container must be an HTMLElement.'
    );
  }

  const container = providedContainer ?? currentDocument.createElement('div');

  if (renderStates.get(container)?.active) {
    throw new Error(
      '@askrjs/askr/testing cannot render into a container that already has an active render.'
    );
  }

  if (managed) {
    container.setAttribute('data-askr-testing-root', '');
    currentDocument.body.appendChild(container);
  }

  const state: RenderState = { active: true, managed };
  renderStates.set(container, state);
  return { container, state };
}

function getEventConstructor(target: EventTarget): typeof Event {
  if (typeof Element !== 'undefined' && target instanceof Element) {
    return target.ownerDocument.defaultView?.Event ?? Event;
  }
  return Event;
}

function isEventForTarget(target: EventTarget, value: unknown): value is Event {
  const TargetEvent = getEventConstructor(target);
  if (value instanceof TargetEvent) {
    return true;
  }

  return typeof Event !== 'undefined' && value instanceof Event;
}

export function flush(): void {
  flushRuntimeScheduler();
}

export function dispatch(
  target: EventTarget,
  event: Event | string,
  init: EventInit = {}
): boolean {
  if (!target || typeof target.dispatchEvent !== 'function') {
    throw new TypeError(
      '@askrjs/askr/testing dispatch requires an EventTarget.'
    );
  }
  if (typeof event !== 'string' && !isEventForTarget(target, event)) {
    throw new TypeError(
      '@askrjs/askr/testing dispatch requires an Event instance or event type string.'
    );
  }

  const dispatchedEvent =
    typeof event === 'string'
      ? new (getEventConstructor(target))(event, {
          bubbles: true,
          cancelable: true,
          ...init,
        })
      : event;

  return target.dispatchEvent(dispatchedEvent);
}

function cleanupContainer(container: HTMLElement): void {
  const state = renderStates.get(container);
  if (!state?.active) {
    return;
  }

  state.active = false;
  try {
    cleanupApp(container);
  } finally {
    container.replaceChildren();
    if (state.managed) {
      container.remove();
    }
    if (state.restoreHistory && state.restoreUrl) {
      state.restoreHistory.replaceState({}, '', state.restoreUrl);
    }
    renderStates.delete(container);
  }
}

function isRenderResult(
  target: RenderResult | HTMLElement
): target is RenderResult {
  return 'container' in target && 'cleanup' in target;
}

export function cleanup(target: RenderResult | HTMLElement): void {
  cleanupContainer(isRenderResult(target) ? target.container : target);
}

function createRenderResult(container: HTMLElement): RenderResult {
  return {
    container,
    root: container,
    flush,
    dispatch,
    unmount: () => cleanupContainer(container),
    cleanup: () => cleanupContainer(container),
  };
}

export function render(
  component: ComponentFunction,
  options?: RenderOptions
): RenderResult {
  if (typeof component !== 'function') {
    throw new TypeError(
      '@askrjs/askr/testing render requires a component function.'
    );
  }

  const { container } = prepareContainer(options);
  try {
    createIsland({
      root: container,
      component,
      cleanupStrict: options?.cleanupStrict,
    });
    flush();
    return createRenderResult(container);
  } catch (error) {
    cleanupContainer(container);
    throw error;
  }
}

export function mount(
  component: ComponentFunction,
  options?: RenderOptions
): RenderResult {
  return render(component, options);
}

export async function renderRoute(
  options: RouteRenderOptions
): Promise<RenderResult> {
  if (!options?.registry) {
    throw new TypeError(
      '@askrjs/askr/testing renderRoute requires a route registry.'
    );
  }

  const currentWindow = requireWindow();
  const { container, state } = prepareContainer(options);
  try {
    if (options.url !== undefined) {
      state.restoreHistory = currentWindow.history;
      state.restoreUrl = `${currentWindow.location.pathname}${currentWindow.location.search}${currentWindow.location.hash}`;
      currentWindow.history.replaceState({}, '', options.url);
    }
    await createSPA({
      root: container,
      registry: options.registry,
      auth: options.auth,
      cleanupStrict: options.cleanupStrict,
    });
    flush();
    return createRenderResult(container);
  } catch (error) {
    cleanupContainer(container);
    throw error;
  }
}
