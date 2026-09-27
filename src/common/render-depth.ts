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

/** `error`, or a `RenderDepthError` when it is a call stack overflow. */
export function clarifyRenderOverflow(error: unknown): unknown {
  if (
    error instanceof RangeError &&
    STACK_OVERFLOW.test(error.message) &&
    !(error instanceof RenderDepthError)
  ) {
    return new RenderDepthError(error);
  }
  return error;
}
