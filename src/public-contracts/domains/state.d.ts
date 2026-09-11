import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { ReadableSource } from './component.js';
import { capture } from './lifecycle.js';
import { For } from './control.js';

/**
 * State value holder - callable to read, has set method to update
 * @example
 * const count = state(0);
 * count();           // read: 0
 * count.set(1);      // write: triggers re-render
 */
interface State<T> extends ReadableSource<T> {
  (): T;
  set(...args: StateSetterArgs<T>): void;
  [Symbol.iterator](): IterableIterator<StateTuple<T>[number]>;
}

type StateUpdater<T> = (prev: T) => T;

type StateSetterArgs<T> = [Extract<T, (...args: any[]) => unknown>] extends [
  never,
]
  ? [value: T] | [updater: StateUpdater<T>]
  : [updater: StateUpdater<T>];

/**
 * Public setter type for state cells.
 */
type StateSetter<T> = (...args: StateSetterArgs<T>) => void;

/**
 * Tuple-first state handle returned by `state()`.
 */
type StateTuple<T> = [get: State<T>, set: StateSetter<T>] & State<T>;

/**
 * Creates a local state value for a component
 * Optimized for:
 * - O(1) read performance
 * - Minimal allocation per state
 * - Fast scheduler integration
 *
 * IMPORTANT: state() must be called during component render execution.
 * It captures the current component instance from context.
 * Calling outside a component function will throw an error.
 *
 * @example
 * ```ts
 * // ✅ Correct: called during render
 * export function Counter() {
 *   const [count, setCount] = state(0);
 *   return { type: 'button', children: [count()] };
 * }
 *
 * // ❌ Wrong: called outside component
 * const count = state(0);
 * export function BadComponent() {
 *   return { type: 'div' };
 * }
 * ```
 */
declare function state<T>(initialValue: T): StateTuple<T>;

declare const SNAPSHOT_SOURCE_BRAND: unique symbol;

type SnapshotSourceBrand = {
  readonly [SNAPSHOT_SOURCE_BRAND]: true;
};

/** A reactive derived value produced by {@link derive}; call it to read the current result. */
interface Derived<T> extends ReadableSource<T> {
  (): T;
}

type SnapshotSource<T> = {
  value: T | null;
  pending?: boolean;
  error?: Error | null;
} & SnapshotSourceBrand;

/** Creates a render-scoped derived value; must be called during component render. */
declare function derive<TOut>(fn: () => TOut): Derived<TOut>;

declare function derive<TIn, TOut>(
  source: SnapshotSource<TIn> | TIn | (() => TIn),
  map: (value: TIn) => TOut
): Derived<TOut | null>;

/** A fine-grained reactive membership check produced by {@link selector}. */
interface Selector<T> {
  (candidate: T): boolean;
}

type SelectorEquals<T> = {
  bivarianceHack(a: T, b: T): boolean;
}['bivarianceHack'];

/**
 * Creates a render-scoped predicate for keyed membership in reactive list rows.
 *
 * Use this when a `<For>` child needs to compare each stable item with a
 * changing selected value. Unlike a plain closure capture, the predicate
 * subscribes the affected rows and updates them without rebuilding the list.
 * Must be called during component render.
 */
declare function selector<T>(
  source: () => T,
  equals?: SelectorEquals<T>
): Selector<T>;
export {
  State,
  StateUpdater,
  StateSetterArgs,
  StateSetter,
  StateTuple,
  state,
  SNAPSHOT_SOURCE_BRAND,
  SnapshotSourceBrand,
  Derived,
  SnapshotSource,
  derive,
  Selector,
  SelectorEquals,
  selector,
};
