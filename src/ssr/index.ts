/**
 * SSR - Server-Side Rendering
 *
 * Renders Askr components to static HTML strings for server-side rendering.
 * SSR is synchronous: async components are not supported; async work should use
 * `resource()` which is rejected during synchronous SSR. This module throws
 * when an async component or async resource is encountered during sync SSR.
 */

import type { JSXElement } from '../jsx/types';
import {
  createComponentInstance,
  getCurrentComponentInstance,
  setCurrentComponentInstance,
  type ComponentFunction,
  type ComponentInstance,
} from '../runtime/component';
import { createApp } from '../app/createApp';

import type { Props } from '../shared/types';

type VNode = {
  type: string;
  props?: Props;
  children?: (string | VNode | null | undefined | false)[];
};

export type Component = (
  props: Props,
  context?: { signal: AbortSignal }
) => VNode | JSXElement;

// HTML5 void elements that don't have closing tags
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Escape cache for common values
const escapeCache = new Map<string, string>();

/**
 * Escape HTML special characters in text content (optimized with cache)
 */
function escapeText(text: string): string {
  const cached = escapeCache.get(text);
  if (cached) return cached;

  const str = String(text);
  // Fast path: check if escaping needed
  if (!str.includes('&') && !str.includes('<') && !str.includes('>')) {
    escapeCache.set(text, str);
    return str;
  }

  const result = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  if (escapeCache.size < 256) {
    escapeCache.set(text, result);
  }
  return result;
}

/**
 * Escape HTML special characters in attribute values
 */
function escapeAttr(value: string): string {
  const str = String(value);
  // Fast path: check if escaping needed
  if (
    !str.includes('&') &&
    !str.includes('"') &&
    !str.includes("'") &&
    !str.includes('<') &&
    !str.includes('>')
  ) {
    return str;
  }

  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Render attributes to HTML string, excluding event handlers
 * Optimized for minimal allocations
 */
function renderAttrs(props?: Props): string {
  if (!props || typeof props !== 'object') return '';

  let result = '';
  for (const [key, value] of Object.entries(props)) {
    // Skip event handlers (onClick, onChange, etc.)
    if (key.startsWith('on') && key[2] === key[2].toUpperCase()) {
      continue;
    }
    // Skip internal props
    if (key.startsWith('_')) {
      continue;
    }

    // Normalize class attribute (`class` preferred, accept `className` for compatibility)
    const attrName = key === 'class' || key === 'className' ? 'class' : key;

    // Boolean attributes
    if (value === true) {
      result += ` ${attrName}`;
    } else if (value === false || value === null || value === undefined) {
      // Skip falsy values
      continue;
    } else {
      // Regular attributes
      result += ` ${attrName}="${escapeAttr(String(value))}"`;
    }
  }
  return result;
}

/**
 * Recursively render a single child (VNode or text)
 * Optimized for fast type checking
 */
async function renderChild(child: unknown): Promise<string> {
  // Fast path: handle primitives first (most common)
  if (typeof child === 'string') {
    return escapeText(child);
  }
  if (typeof child === 'number') {
    return escapeText(String(child));
  }
  if (child === null || child === undefined || child === false) {
    return '';
  }

  // Handle objects (VNode or JSXElement)
  if (typeof child === 'object' && child !== null && 'type' in child) {
    return renderNode(child as JSXElement | VNode);
  }

  return '';
}

/**
 * Render an array of children (async path)
 * Optimized: Sequential rendering avoids excessive Promise overhead for large lists
 */
async function renderChildren(children?: unknown[]): Promise<string> {
  if (!children || !Array.isArray(children) || children.length === 0) {
    return '';
  }

  // For small lists, use Promise.all for potential parallelization
  if (children.length <= 5) {
    const results = await Promise.all(
      children.map((child) => renderChild(child))
    );
    return results.join('');
  }

  // For large lists, render sequentially to reduce Promise overhead
  let result = '';
  for (const child of children) {
    result += await renderChild(child);
  }
  return result;
}

/**
 * Synchronous rendering helpers (used for strictly synchronous SSR)
 */
function renderChildSync(child: unknown): string {
  if (typeof child === 'string') return escapeText(child);
  if (typeof child === 'number') return escapeText(String(child));
  if (child === null || child === undefined || child === false) return '';
  if (typeof child === 'object' && child !== null && 'type' in child) {
    return renderNodeSync(child as JSXElement | VNode);
  }
  return '';
}

function renderChildrenSync(children?: unknown[]): string {
  if (!children || !Array.isArray(children) || children.length === 0) return '';
  let result = '';
  for (const child of children) result += renderChildSync(child);
  return result;
}

/**
 * Render a VNode or JSXElement to HTML string (async capable)
 */
async function renderNode(node: VNode | JSXElement): Promise<string> {
  const { type, props } = node;

  // Handle function components (JSXElement with function type)
  if (typeof type === 'function') {
    const result = executeComponent(type as Component, props);
    return renderNode(result);
  }

  // Handle string type (HTML elements)
  const typeStr = type as string;

  // Fast path: void elements (self-closing) - check before computing children
  if (VOID_ELEMENTS.has(typeStr)) {
    const attrs = renderAttrs(props);
    return `<${typeStr}${attrs} />`;
  }

  // Normal elements: compute attrs and children
  const attrs = renderAttrs(props);
  const children = (node as VNode).children;
  const childrenHtml = await renderChildren(children);

  return `<${typeStr}${attrs}>${childrenHtml}</${typeStr}>`;
}

/**
 * Render a VNode synchronously. Throws if an async component is encountered.
 */
function renderNodeSync(node: VNode | JSXElement): string {
  const { type, props } = node;

  if (typeof type === 'function') {
    const result = executeComponentSync(type as Component, props);
    if (result instanceof Promise) {
      throw new Error('SSR does not support async components');
    }
    return renderNodeSync(result as VNode | JSXElement);
  }

  const typeStr = type as string;
  if (VOID_ELEMENTS.has(typeStr)) {
    const attrs = renderAttrs(props);
    return `<${typeStr}${attrs} />`;
  }

  const attrs = renderAttrs(props);
  const children = (node as VNode).children;
  const childrenHtml = renderChildrenSync(children);
  return `<${typeStr}${attrs}>${childrenHtml}</${typeStr}>`;
}

/**
 * Execute a component function (synchronously or async) and return VNode
 */
// Simple seeded random number generator for deterministic SSR
class SeededRNG {
  private seed: number;

  constructor(seed: number = 0) {
    this.seed = seed;
  }

  reset(seed: number = 12345) {
    this.seed = seed;
  }

  random(): number {
    // Simple LCG (Linear Congruential Generator)
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
}

// Global deterministic RNG instance for SSR
const ssrRNG = new SeededRNG();

function executeComponent(
  component: Component,
  props?: Record<string, unknown>
): VNode | JSXElement {
  // Reset RNG to ensure deterministic output for each SSR call
  ssrRNG.reset();

  // Save original Math.random
  const originalRandom = Math.random;

  // Replace with deterministic RNG during SSR
  Math.random = () => ssrRNG.random();

  // Create temporary instance for SSR to allow state() calls
  const tempInstance = createComponentInstance(
    'ssr-temp',
    component,
    props || {},
    null
  );
  // Mark as SSR instance to signal sync-only behavior
  (tempInstance as ComponentInstance).ssr = true;

  const originalInstance = getCurrentComponentInstance();
  setCurrentComponentInstance(tempInstance);

  try {
    const result = component(props || {});

    // Async components are not allowed in SSR
    if (result instanceof Promise) {
      throw new Error('SSR does not support async components');
    }

    return result;
  } finally {
    // Restore original instance
    setCurrentComponentInstance(originalInstance);

    // Restore original Math.random
    Math.random = originalRandom;
  }
}

/**
 * Execute a component synchronously for strict SSR. Throws if the component returns a Promise.
 */
function executeComponentSync(
  component: Component,
  props?: Record<string, unknown>
): VNode | JSXElement {
  ssrRNG.reset();

  const originalRandom = Math.random;
  const originalDateNow = Date.now;

  // In development, enforce strict SSR purity by throwing if global time or
  // randomness is accessed during synchronous SSR. In production we provide a
  // deterministic RNG for compatibility.
  if (process.env.NODE_ENV !== 'production') {
    Math.random = () => {
      throw new Error(
        'SSR Strict Purity: Math.random is not allowed during synchronous SSR'
      );
    };
    (Date as unknown as { now: () => number }).now = () => {
      throw new Error(
        'SSR Strict Purity: Date.now is not allowed during synchronous SSR'
      );
    };
  } else {
    Math.random = () => ssrRNG.random();
  }

  const tempInstance = createComponentInstance(
    'ssr-temp',
    component,
    props || {},
    null
  );
  // Mark as SSR instance
  (tempInstance as ComponentInstance).ssr = true;
  const originalInstance = getCurrentComponentInstance();
  setCurrentComponentInstance(tempInstance);

  try {
    const result = component(props || {});
    if (result instanceof Promise) {
      throw new Error('SSR does not support async components');
    }
    return result;
  } finally {
    setCurrentComponentInstance(originalInstance);
    Math.random = originalRandom;
    (Date as unknown as { now: () => number }).now = originalDateNow;
  }
}

/**
 * Main SSR function: render a component to HTML string
 */
/**
 * Async render to string (keeps previous behavior for async-capable components)
 */
export async function renderToString(
  component: Component,
  props?: Record<string, unknown>
): Promise<string> {
  const node = await executeComponent(component, props);
  return renderNode(node);
}

/**
 * Strict synchronous SSR API (recommended): render a component to a string.
 * Throws when component returns a Promise (SSR must be synchronous).
 * Signature: renderToString(fn: () => JSXElement): string
 */
export function renderToStringSync(
  component: (props?: Record<string, unknown>) => VNode | JSXElement
): string {
  const node = executeComponentSync(component as Component, undefined);
  return renderNodeSync(node);
}

/**
 * Render multiple components to individual HTML strings
 * Useful for rendering route-specific content
 */
export async function renderToStringBatch(
  components: Array<{ component: Component; props?: Record<string, unknown> }>
): Promise<string[]> {
  return Promise.all(
    components.map(({ component, props }) => renderToString(component, props))
  );
}

/**
 * Hydrate server-generated DOM for a root selector and component.
 * - Verifies the existing DOM matches the synchronous render
 * - Calls `createApp` to mount the runtime (which will re-execute the component)
 * - Fails fast on mismatch (throws an Error)
 */
export async function hydrate(
  selector: string,
  component: (props?: Record<string, unknown>) => VNode | JSXElement
): Promise<void> {
  const root = document.querySelector(selector);
  if (!root) throw new Error(`hydrate: selector not found: ${selector}`);

  // Do a strict synchronous render and compare
  const expected = renderToStringSync(component);
  const normalize = (html: string) => html.replace(/\s+/g, ' ').trim();
  if (normalize(root.innerHTML) !== normalize(expected)) {
    throw new Error(
      'Hydration mismatch: server HTML does not match client render'
    );
  }

  // Mount the runtime in the normal way (this will attach listeners and initialize state)
  // We use createApp so the runtime lifecycle (mounts, on, timers) is consistent.
  // Pass the actual root element (not selector) to avoid id-format mismatches.
  createApp({
    root: root as Element,
    component: component as unknown as ComponentFunction,
  });
}
