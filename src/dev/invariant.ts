/**
 * Invariant assertion utilities for correctness checking
 * Production-safe: invariants are enforced at build-time or with minimal overhead
 *
 * Core principle: fail fast when invariants are violated
 * All functions throw descriptive errors for debugging
 */

/**
 * Assert a condition; throw with context if false
 * @internal
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

/**
 * Assert object property exists and has correct type
 * @internal
 */
export function assertProperty<T extends object, K extends keyof T>(
  obj: T,
  prop: K,
  expectedType?: string
): asserts obj is T & Required<Pick<T, K>> {
  invariant(prop in obj, `Object missing required property '${String(prop)}'`, {
    object: obj,
  });

  if (expectedType) {
    const actualType = typeof obj[prop];
    invariant(
      actualType === expectedType,
      `Property '${String(prop)}' has type '${actualType}', expected '${expectedType}'`,
      { value: obj[prop], expectedType }
    );
  }
}

/**
 * Assert a reference is not null/undefined
 * @internal
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message: string
): asserts value is T {
  invariant(value !== null && value !== undefined, message, { value });
}

/**
 * Assert a task runs exactly once atomically
 * Useful for verifying lifecycle events fire precisely when expected
 * @internal
 */
export class Once {
  private called = false;
  private calledAt: number | null = null;
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  check(): boolean {
    return this.called;
  }

  mark(): void {
    invariant(
      !this.called,
      `${this.name} called multiple times (previously at ${this.calledAt}ms)`,
      { now: Date.now() }
    );
    this.called = true;
    this.calledAt = Date.now();
  }

  reset(): void {
    this.called = false;
    this.calledAt = null;
  }
}

/**
 * Assert a value falls in an enumerated set
 * @internal
 */
export function assertEnum<T extends readonly unknown[]>(
  value: unknown,
  allowedValues: T,
  fieldName: string
): asserts value is T[number] {
  invariant(
    allowedValues.includes(value),
    `${fieldName} must be one of [${allowedValues.join(', ')}], got ${JSON.stringify(value)}`,
    { value, allowed: allowedValues }
  );
}

/**
 * Assert execution context (scheduler, component, etc)
 * @internal
 */
export function assertContext(
  actual: unknown,
  expected: unknown,
  contextName: string
): asserts actual is typeof expected {
  invariant(
    actual === expected,
    `Invalid ${contextName} context. Expected ${expected}, got ${actual}`,
    { expected, actual }
  );
}

/**
 * Assert scheduling precondition (not reentering, not during render, etc)
 * @internal
 */
export function assertSchedulingPrecondition(
  condition: boolean,
  violationMessage: string
): asserts condition {
  invariant(condition, `[Scheduler Precondition] ${violationMessage}`);
}

/**
 * Assert state precondition
 * @internal
 */
export function assertStatePrecondition(
  condition: boolean,
  violationMessage: string
): asserts condition {
  invariant(condition, `[State Precondition] ${violationMessage}`);
}

/**
 * Verify AbortController lifecycle
 * @internal
 */
export function assertAbortControllerState(
  signal: AbortSignal,
  expectedAborted: boolean,
  context: string
): void {
  invariant(
    signal.aborted === expectedAborted,
    `AbortSignal ${expectedAborted ? 'should be' : 'should not be'} aborted in ${context}`,
    { actual: signal.aborted, expected: expectedAborted }
  );
}

/**
 * Guard: throw if callback is null when it shouldn't be
 * Used for notifyUpdate, event handlers, etc.
 * @internal
 */
export function assertCallbackAvailable<
  T extends (...args: unknown[]) => unknown,
>(callback: T | null | undefined, callbackName: string): asserts callback is T {
  invariant(
    callback !== null && callback !== undefined,
    `${callbackName} callback is required but not available`,
    { callback }
  );
}

/**
 * Verify evaluation generation prevents stale evaluations
 * @internal
 */
export function assertEvaluationGeneration(
  current: number,
  latest: number,
  context: string
): void {
  invariant(
    current === latest,
    `Stale evaluation generation in ${context}: current ${current}, latest ${latest}`,
    { current, latest }
  );
}

/**
 * Verify mounted flag state
 * @internal
 */
export function assertMountedState(
  mounted: boolean,
  expectedMounted: boolean,
  context: string
): void {
  invariant(
    mounted === expectedMounted,
    `Invalid mounted state in ${context}: expected ${expectedMounted}, got ${mounted}`,
    { mounted, expected: expectedMounted }
  );
}

/**
 * Verify no null target when rendering
 * @internal
 */
export function assertRenderTarget(
  target: Element | null,
  context: string
): asserts target is Element {
  invariant(target !== null, `Cannot render in ${context}: target is null`, {
    target,
  });
}
