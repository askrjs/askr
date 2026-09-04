/** Minimal shape of an event that can be prevented from its default action. */
interface DefaultPreventable {
  defaultPrevented?: boolean;
  preventDefault?: () => void;
}
/** Minimal shape of an event whose propagation can be stopped. */
interface PropagationStoppable {
  stopPropagation?: () => void;
}
/** Structural subset of a keyboard event, for handlers that accept native or synthetic events. */
interface KeyboardLikeEvent extends DefaultPreventable, PropagationStoppable {
  key: string;
  currentTarget?: unknown;
  target?: unknown;
}
/** Structural subset of a pointer event, for handlers that accept native or synthetic events. */
interface PointerLikeEvent extends DefaultPreventable, PropagationStoppable {
  target?: unknown;
}
/** Structural subset of a focus event, for handlers that accept native or synthetic events. */
interface FocusLikeEvent extends DefaultPreventable, PropagationStoppable {
  relatedTarget?: unknown;
}
/**
 * composeHandlers
 *
 * Compose two event handlers into one. The first handler runs, and unless it
 * calls `event.preventDefault()` (or sets `defaultPrevented`), the second
 * handler runs. This prevents accidental clobbering of child handlers when
 * injecting props.
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. Execution Order
 *    First handler runs before second (injected before base).
 *    This allows injected handlers to prevent default behavior.
 *
 * 2. Default Prevention Check
 *    By default, checks `defaultPrevented` on first argument.
 *    Can be disabled via options.checkDefaultPrevented = false.
 *
 * 3. Undefined Handler Support
 *    Undefined handlers are skipped (no-op). This simplifies usage
 *    where handlers are optional.
 *
 * 4. Type Safety
 *    Args are readonly to prevent mutation. Return type matches input.
 */
/** Options for {@link composeHandlers}. */
interface ComposeHandlersOptions {
  /**
   * When true (default), do not run the second handler if the first prevented default.
   * When false, always run both handlers.
   */
  checkDefaultPrevented?: boolean;
}
/**
 * Compose two optional event handlers into one, running `first` then
 * `second` unless `first` marked the event as default-prevented.
 */
declare function composeHandlers<A extends readonly unknown[]>(
  first?: (...args: A) => void,
  second?: (...args: A) => void,
  options?: ComposeHandlersOptions
): (...args: A) => void;
/**
 * Merge `base` props over `injected` props: non-handler keys in `base` win,
 * and matching event handlers are composed (`injected` runs first).
 */
declare function mergeProps<TBase extends object, TInjected extends object>(
  base: TBase,
  injected: TInjected
): TInjected & TBase;
/**
 * Tiny aria helpers
 */
/** Build an `aria-disabled` prop object; omitted entirely when `disabled` is falsy. */
declare function ariaDisabled(disabled?: boolean): {
  'aria-disabled'?: 'true';
};
/** Build an `aria-expanded` prop object; omitted when `expanded` is `undefined`. */
declare function ariaExpanded(expanded?: boolean): {
  'aria-expanded'?: 'true' | 'false';
};
/** Build an `aria-selected` prop object; omitted when `selected` is `undefined`. */
declare function ariaSelected(selected?: boolean): {
  'aria-selected'?: 'true' | 'false';
};
/** Options for {@link formatId}. */
interface FormatIdOptions {
  /** Defaults to 'askr' */
  prefix?: string;
  /** Stable, caller-provided identity */
  id: string | number;
}
/**
 * formatId
 *
 * Formats a stable ID from a caller-provided identity.
 * - Pure and deterministic (no time/randomness/global counters)
 * - SSR-safe
 *
 * POLICY DECISIONS (LOCKED):
 *
 * 1. No Auto-Generation
 *    Caller must provide the `id`. No random/sequential generation.
 *    This ensures determinism and SSR safety.
 *
 * 2. Format Convention
 *    IDs are formatted as `{prefix}-{id}`.
 *    Default prefix is "askr".
 *
 * 3. Type Coercion
 *    Numbers are coerced to strings via String().
 *    This is deterministic and consistent.
 */
declare function formatId(options: FormatIdOptions): string;
export {
  ariaSelected,
  composeHandlers,
  KeyboardLikeEvent,
  PointerLikeEvent,
  ariaExpanded,
  DefaultPreventable,
  formatId,
  mergeProps,
  PropagationStoppable,
  ariaDisabled,
  ComposeHandlersOptions,
  FormatIdOptions,
  FocusLikeEvent,
};
