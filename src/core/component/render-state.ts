/**
 * Whether a component render or a function child is executing. State writes
 * are rejected while one is, because they would re-trigger the render.
 */

let renderDepth = 0;

export function isRendering(): boolean {
  return renderDepth > 0;
}

export function withRendering<T>(fn: () => T): T {
  renderDepth++;
  try {
    return fn();
  } finally {
    renderDepth--;
  }
}

/** Run `fn` outside any render (event handlers and lifecycle callbacks). */
export function outsideRendering<T>(fn: () => T): T {
  const saved = renderDepth;
  renderDepth = 0;
  try {
    return fn();
  } finally {
    renderDepth = saved;
  }
}
