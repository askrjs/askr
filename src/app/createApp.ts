/**
 * App bootstrap and mount
 */

import {
  createComponentInstance,
  mountComponent,
  cleanupComponent,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime/component';
import { globalScheduler } from '../runtime/scheduler';
import { logger } from '../dev/logger';
import type { Component as SSRComponent } from '../ssr';
import { removeAllListeners } from '../renderer/dom';
import { registerAppInstance, initializeNavigation } from '../router/navigate';

let componentIdCounter = 0;

// Track instances by root element to support multiple createApp calls on same root
const instancesByRoot = new WeakMap<Element, ComponentInstance>();

// Symbol for storing cleanup on elements
const CLEANUP_SYMBOL = Symbol.for('__tempoCleanup__');

// Type for elements that have cleanup functions attached
interface ElementWithCleanup extends Element {
  [CLEANUP_SYMBOL]?: () => void;
}

export interface AppConfig {
  root: Element | string;
  component: ComponentFunction;
}

/**
 * Bootstrap and mount app on client
 * Supports both sync and async components
 *
 * If createApp is called multiple times on the same root, the existing instance
 * is reused and its component function is updated. This ensures:
 * - Generation tokens work correctly (old async renders don't overwrite new ones)
 * - State is preserved across updates (if desired)
 * - DOM is diffed/updated rather than replaced
 */
export function createApp(config: AppConfig): void {
  if (!config || typeof config !== 'object') {
    throw new Error('createApp requires a config object');
  }

  if (typeof config.component !== 'function') {
    throw new Error('createApp: component must be a function');
  }

  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;

  if (!rootElement) {
    throw new Error(`Root element not found: ${config.root}`);
  }

  // DEV: Detect clearly invalid state() usage patterns via simple source heuristics
  // These are runtime checks to catch common mistakes until static analysis is added.
  function detectInvalidStateUsage(fn: ComponentFunction): string | null {
    try {
      const src = fn.toString();
      // Heuristic 1: state() after an early return in the same function
      const returnPos = src.indexOf('return');
      // Look for any reference to state, including namespaced (e.g., index_1.state)
      const statePos = (() => {
        const direct = src.indexOf('state(');
        if (direct !== -1) return direct;
        const namespaced = src.indexOf('.state(');
        if (namespaced !== -1) return namespaced;
        const loose = src.indexOf('state');
        return loose;
      })();
      if (returnPos !== -1 && statePos !== -1 && statePos > returnPos) {
        return 'Invalid state() call after return: state() must be at the top level before any early returns.';
      }
      // Heuristic 2: state() inside try/catch block
      const hasTry = src.includes('try');
      const hasCatch = src.includes('catch');
      const mentionsState = src.includes('state') || src.includes('.state');
      if (hasTry && hasCatch && mentionsState) {
        // More precise check: look for state() calls between try and catch
        const tryIndex = src.indexOf('try');
        const catchIndex = src.indexOf('catch');
        const stateCallIndex = src.indexOf('state(');
        if (stateCallIndex > tryIndex && stateCallIndex < catchIndex) {
          return 'Invalid state() usage inside try/catch: state() must be called at the top level without control flow.';
        }
      }
    } catch {
      // If toString() is unavailable (minified/native), skip heuristics
    }
    return null;
  }

  const structuralError = detectInvalidStateUsage(config.component);
  if (structuralError) {
    throw new Error(structuralError);
  }

  // Clean up any existing cleanup function before mounting new one
  const existingCleanup = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  if (existingCleanup) {
    existingCleanup();
  }

  let instance = instancesByRoot.get(rootElement);

  if (instance) {
    // Cleanup old component before switching
    removeAllListeners(rootElement);
    cleanupComponent(instance);

    // Reuse existing instance, just update the component function
    // Validate new component structure before updating
    const structuralErrorUpdate = detectInvalidStateUsage(config.component);
    if (structuralErrorUpdate) {
      throw new Error(structuralErrorUpdate);
    }
    instance.fn = config.component;
    // Increment generation to invalidate any pending async evaluations from old component
    instance.evaluationGeneration++;
    // Clear mounted state to trigger re-evaluation
    instance.mounted = false;
    // Reset hook order validation for new component
    instance.expectedStateIndices = [];
    instance.firstRenderComplete = false;
    // Mark reused instance as root
    instance.isRoot = true;
  } else {
    // Create new instance
    const componentId = String(++componentIdCounter);
    instance = createComponentInstance(
      componentId,
      config.component,
      {},
      rootElement
    );
    instancesByRoot.set(rootElement, instance);
    // Mark new instance as root
    instance.isRoot = true;
  }

  // Store cleanup function on the element for manual cleanup
  // (This allows external code to cleanup by checking innerHTML, etc.)
  (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL] = () => {
    removeAllListeners(rootElement);
    cleanupComponent(instance as ComponentInstance);
  };

  // Use Object.defineProperty to intercept innerHTML changes
  // This allows us to cleanup when container.innerHTML = '' is called
  try {
    const descriptor =
      Object.getOwnPropertyDescriptor(rootElement, 'innerHTML') ||
      Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(rootElement),
        'innerHTML'
      ) ||
      Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML');

    if (descriptor && (descriptor.get || descriptor.set)) {
      Object.defineProperty(rootElement, 'innerHTML', {
        get: descriptor.get
          ? function (this: Element) {
              return descriptor.get!.call(this);
            }
          : undefined,
        set: function (this: Element, value: string) {
          // If setting empty HTML, cleanup the component
          if (value === '' && instancesByRoot.get(this) === instance) {
            removeAllListeners(rootElement);
            cleanupComponent(instance as ComponentInstance);
          }
          if (descriptor.set) {
            return descriptor.set.call(this, value);
          }
        },
        configurable: true,
      });
    }
  } catch {
    // If Object.defineProperty fails, silently ignore - cleanup will happen on replacement
  }

  mountComponent(instance);

  // Ensure initial mount tasks complete synchronously so tests that expect
  // immediate DOM on createApp continue to pass. Do NOT swallow flush errors
  // so failures surface to the test harness and help us debug mount issues.
  globalScheduler.flush();

  // Register for navigation
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  registerAppInstance(instance, path);
  initializeNavigation();
}

export async function hydrate(config: AppConfig): Promise<void> {
  const rootElement =
    typeof config.root === 'string'
      ? document.getElementById(config.root)
      : config.root;

  if (!rootElement) {
    throw new Error(`Root element not found: ${config.root}`);
  }

  // Capture server HTML for mismatch detection
  const serverHTML = rootElement.innerHTML;

  // Hydration: Re-renders the component deterministically over existing SSR-rendered DOM.
  // Unlike VDOM frameworks, this does NOT attempt to reuse or diff the existing DOM.
  // Instead, it re-executes the component function from scratch, which produces
  // identical output to the server render (deterministic by construction).
  //
  // Why no state restoration?
  // - Components initialize state via state() calls during render
  // - State is deterministic: same input props → same state values
  // - Future: Snapshot-based pre-population could be added if needed
  //
  // The advantage: Zero hydration mismatch bugs — server and client always agree
  createApp(config);

  // Check for hydration mismatch in development
  if (process.env.NODE_ENV !== 'production') {
    // Render the component to string to get expected HTML
    const { renderToString } = await import('../ssr');
    // Cast here because ComponentFunction may also return primitives (string/number)
    // and the SSR helper expects a stricter Component signature.
    const expectedHTML = await renderToString(
      config.component as unknown as SSRComponent,
      {}
    );

    // Simple mismatch detection: compare normalized HTML
    const normalizeHTML = (html: string) => html.replace(/\s+/g, ' ').trim();

    const normalizedServer = normalizeHTML(serverHTML);
    const normalizedExpected = normalizeHTML(expectedHTML);

    if (normalizedServer !== normalizedExpected) {
      logger.warn(
        '[Askr] Hydration mismatch detected. Server HTML does not match client render.',
        { server: normalizedServer, client: normalizedExpected }
      );
    }
  }
}

/**
 * Cleanup an app mounted on a root element (element or id).
 * Safe to call multiple times — no-op when nothing is mounted.
 */
export function cleanupApp(root: Element | string): void {
  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root;

  if (!rootElement) return;

  const cleanupFn = (rootElement as ElementWithCleanup)[CLEANUP_SYMBOL];
  if (typeof cleanupFn === 'function') {
    cleanupFn();
  }

  instancesByRoot.delete(rootElement);
}

/**
 * Check whether an app is mounted on the given root
 */
export function hasApp(root: Element | string): boolean {
  const rootElement =
    typeof root === 'string' ? document.getElementById(root) : root;

  if (!rootElement) return false;
  return instancesByRoot.has(rootElement);
}
