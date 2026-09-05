import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { ReadableSource } from './component.js';

/** A gating condition for lifecycle primitives like {@link timer}; `true` means active. */
type ActivityPredicate = () => boolean;

/** Options for {@link timer}. */
interface TimerOptions {
  when?: ActivityPredicate | readonly ActivityPredicate[];
}

/** {@link ActivityPredicate} that is true while the current route matches `pathOrPaths`. */
declare function routeActive(
  pathOrPaths: string | readonly string[]
): ActivityPredicate;

/** {@link ActivityPredicate} that is true while the document is visible. */
declare function documentVisible(): ActivityPredicate;

/** {@link ActivityPredicate} that is true while the window has focus. */
declare function windowFocused(): ActivityPredicate;

/** An event target, or a function resolving one, accepted by {@link on}. */
type ListenerTarget = EventTarget | (() => EventTarget | null | undefined);

type ListenerOptions = boolean | AddEventListenerOptions | undefined;

/** Attach an owned event listener to `target` for the current component's lifetime. */
declare function on(
  target: ListenerTarget,
  event: string,
  handler: EventListener,
  options?: ListenerOptions
): void;

/** Run `fn` on an owned interval for the current component's lifetime, optionally gated by `options.when`. */
declare function timer(
  intervalMs: number,
  fn: () => void,
  options?: TimerOptions
): void;

/** Runs an owned task after commit. */
declare function task(
  fn: () => void | (() => void) | PromiseLike<void | (() => void)>
): void;

/** A callable reactive source accepted by {@link watch}. */
type WatchSource<T> = ReadableSource<T>;

/** Values inferred from an ordered tuple of {@link WatchSource} accessors. */
type WatchValues<TSources extends readonly WatchSource<unknown>[]> = {
  -readonly [TIndex in keyof TSources]: ReturnType<TSources[TIndex]>;
};

/** Post-commit generation details supplied to a {@link watch} callback. */
interface WatchContext<TValue> {
  readonly initial: boolean;
  readonly previous: TValue | undefined;
  readonly signal: AbortSignal;
}

/** Owned side-effect callback invoked by {@link watch}. */
type WatchCallback<TValue> = (
  value: TValue,
  context: WatchContext<TValue>
) => void | (() => void) | PromiseLike<void>;

/** Observe one readable source after commit and whenever its value changes. */
declare function watch<TValue>(
  source: WatchSource<TValue>,
  callback: WatchCallback<TValue>
): void;

/** Observe an ordered tuple of readable sources after commit and whenever an entry changes. */
declare function watch<const TSources extends readonly WatchSource<unknown>[]>(
  sources: TSources,
  callback: WatchCallback<WatchValues<TSources>>
): void;

/**
 * Capture the result of a synchronous expression at call time and return a
 * thunk that returns the captured value later. This is a low-level helper for
 * cases where async continuations need to observe a snapshot of values at the
 * moment scheduling occurred.
 *
 * Usage (public API):
 * const snapshot = capture(() => someState());
 * Promise.resolve().then(() => { use(snapshot()); });
 */
declare function capture<T>(fn: () => T): () => T;
export {
  ActivityPredicate,
  TimerOptions,
  routeActive,
  documentVisible,
  windowFocused,
  ListenerTarget,
  ListenerOptions,
  on,
  timer,
  task,
  WatchSource,
  WatchValues,
  WatchContext,
  WatchCallback,
  watch,
  capture,
};
