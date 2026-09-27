/**
 * Askr renders nested components recursively, so a very deep tree can exhaust
 * the JavaScript call stack. Replace the engine's bare RangeError with an
 * error that says what happened and how to fix it.
 */

const STACK_OVERFLOW = /maximum call stack|too much recursion/i;

export class RenderDepthError extends Error {
  declare readonly cause: unknown;

  constructor(cause: unknown) {
    super(
      '[Askr] The component tree is too deep to render: the JavaScript call ' +
        'stack overflowed. Askr renders nested elements and components ' +
        'recursively; keep nesting to a few hundred levels and render long ' +
        'sequences as lists (for example with <For>) instead of recursion.'
    );
    this.name = 'RenderDepthError';
    (this as { cause?: unknown }).cause = cause;
  }
}

/**
 * `error`, or a `RenderDepthError` when it is an engine stack overflow: a
 * `RangeError` in V8 and JavaScriptCore, an `InternalError` in Firefox.
 * Callers near the overflow may have too little stack left to convert; then
 * the original error is returned and a shallower caller converts it.
 */
export function clarifyRenderOverflow(error: unknown): unknown {
  try {
    if (
      error instanceof Error &&
      (error instanceof RangeError || error.name === 'InternalError') &&
      STACK_OVERFLOW.test(error.message)
    ) {
      return new RenderDepthError(error);
    }
  } catch {
    // Out of stack while converting.
  }
  return error;
}
