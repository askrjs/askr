/**
 * Invariant assertions shared by production runtime code.
 */

export function invariant(
  condition: boolean,
  message: string,
  context?: Record<string, unknown>
): asserts condition {
  if (!condition) {
    const contextStr = context ? '\n' + JSON.stringify(context, null, 2) : '';
    throw new Error(`[Askr Invariant] ${message}${contextStr}`);
  }
}

export function assertSchedulingPrecondition(
  condition: boolean,
  violationMessage: string
): asserts condition {
  invariant(condition, `[Scheduler Precondition] ${violationMessage}`);
}
