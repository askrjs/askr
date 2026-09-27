import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { state, selector } from './state.js';
import { VNode, RenderableChild } from './context.js';
import { on } from './lifecycle.js';

type ForEachSource<T> = readonly T[] | (() => readonly T[]);

type BoundaryChild = RenderableChild;

type ForBaseProps<T> = {
  each: ForEachSource<T>;
  fallback?: BoundaryChild;
  /**
   * Row renderer. Existing rows rerun with the latest callback when the parent
   * rerenders, and a reactive read in the callback subscribes that row. Prefer
   * `selector()` or thunk props so only the affected rows or props update.
   */
  children: (item: T, index: () => number) => VNode;
};

type KeyedForProps<T, K extends string | number> = ForBaseProps<T> & {
  by: (item: T, index: number) => K;
  byIndex?: never;
};

type IndexedForProps<T> = ForBaseProps<T> & {
  by?: never;
  byIndex: true;
};

/** Props for {@link For}. */
type ForProps<T, K extends string | number = string | number> =
  | KeyedForProps<T, K>
  | IndexedForProps<T>;

/**
 * {@link ForProps} with a getter `each`. A `state()` getter is also an array
 * (`[getter, setter]`), so `For` tries this form first and reads it as a getter.
 */
type ForGetterProps<T, K extends string | number = string | number> = Omit<
  ForBaseProps<T>,
  'each'
> & { each: () => readonly T[] } & (
    | { by: (item: T, index: number) => K; byIndex?: never }
    | { by?: never; byIndex: true }
  );

/** Render a keyed or indexed list, reconciling items by key instead of position. */
declare const For: {
  <T, K extends string | number = string | number>(
    props: ForGetterProps<T, K>
  ): JSXElement;
  <T, K extends string | number = string | number>(
    props: ForProps<T, K>
  ): JSXElement;
};

type ShowSource<T> = T | (() => T);

type Truthy<T> = T extends false | '' | 0 | 0n | null | undefined ? never : T;

/** Props for {@link Show}. */
type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: BoundaryChild;
  children: BoundaryChild | ((value: Truthy<T>) => BoundaryChild);
};

/** Conditionally render children based on `when`, narrowing truthy values for the render function form. */
declare const Show: <T>(props: ShowProps<T>) => JSXElement;

type MatchChild = BoundaryChild | (() => BoundaryChild);

/** Props for {@link Match}, valid only as a direct child of {@link Case}. */
type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: MatchChild;
};

/** Props for {@link Case}. */
type CaseProps = {
  fallback?: BoundaryChild;
  children?: unknown;
};

/** Declares one branch of a {@link Case}; only valid as its direct child. */
declare function Match(_props: MatchProps): null;

/** Render the first matching {@link Match} child (by `when`), or `fallback` if none match. */
declare const Case: (props: CaseProps) => JSXElement;
export {
  ForEachSource,
  BoundaryChild,
  ForBaseProps,
  KeyedForProps,
  IndexedForProps,
  ForProps,
  For,
  ShowSource,
  Truthy,
  ShowProps,
  Show,
  MatchChild,
  MatchProps,
  CaseProps,
  Match,
  Case,
};
