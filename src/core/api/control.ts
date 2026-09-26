/**
 * Control flow as ordinary components.
 *
 * `Show`, `Case`, and `For` are element types like any other component: they
 * render lazily in their own lifetime, read their sources in their own
 * render, and never claim hook slots in the component that uses them. A
 * branch is wrapped in a keyed fragment so switching branches replaces the
 * branch's lifetime instead of patching one branch's DOM into another's.
 */

import { ELEMENT_TYPE, Fragment, type JSXElement } from '../../common/jsx';
import type { Props } from '../../common/props';
import { Signal } from '../reactive/graph';
import { currentComponent, hookSlot, onCommit } from './hooks';

type Renderable = unknown;

function element(
  type: unknown,
  props: Props,
  key: string | number | null = null
): JSXElement {
  return { $$typeof: ELEMENT_TYPE, type, props, key } as JSXElement;
}

function branch(key: string | number, children: Renderable): JSXElement {
  return element(Fragment, { children }, key);
}

function resolve<T>(value: T | (() => T)): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

function isPresent(value: unknown): boolean {
  return value !== null && value !== undefined && value !== false;
}

// ---------------------------------------------------------------------------
// Show

type ShowSource<T> = T | (() => T);
type Truthy<T> = T extends false | '' | 0 | 0n | null | undefined ? never : T;

export type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: Renderable;
  children: Renderable | ((value: Truthy<T>) => Renderable);
};

/** Render `children` while `when` is truthy, otherwise `fallback`. */
export function Show<T>(props: ShowProps<T>): JSXElement | null {
  const value = resolve(props.when);
  if (value) {
    const children =
      typeof props.children === 'function'
        ? (props.children as (value: Truthy<T>) => Renderable)(
            value as Truthy<T>
          )
        : props.children;
    return branch('show:when', children);
  }
  return isPresent(props.fallback)
    ? branch('show:fallback', props.fallback)
    : null;
}

// ---------------------------------------------------------------------------
// Case / Match

export type MatchChild = Renderable | (() => Renderable);

export type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: MatchChild;
};

export type CaseProps = {
  fallback?: Renderable;
  children?: unknown;
};

/** Declares one branch of a {@link Case}; only valid as its direct child. */
export function Match(_props: MatchProps): null {
  throw new Error(
    '[askr] <Match> may only be used as a direct child of <Case>.'
  );
}

function flatten(children: unknown, out: unknown[] = []): unknown[] {
  if (Array.isArray(children)) {
    for (const child of children) flatten(child, out);
  } else if (isPresent(children)) {
    out.push(children);
  }
  return out;
}

/** Render the first {@link Match} whose `when` is truthy, else `fallback`. */
export function Case(props: CaseProps): JSXElement | null {
  const children = flatten(props.children);
  for (let index = 0; index < children.length; index++) {
    const child = children[index] as JSXElement;
    if (typeof child !== 'object' || child === null || child.type !== Match) {
      throw new Error('[askr] <Case> only accepts <Match> children.');
    }
  }
  for (let index = 0; index < children.length; index++) {
    const child = children[index] as JSXElement;
    const matchProps = child.props as MatchProps;
    if (!resolve(matchProps.when)) continue;
    const key =
      child.key == null
        ? `match:${index}`
        : `match:${index}:${typeof child.key}:${String(child.key)}`;
    return branch(key, resolve(matchProps.children as () => Renderable));
  }
  return isPresent(props.fallback)
    ? branch('case:fallback', props.fallback)
    : null;
}

// ---------------------------------------------------------------------------
// For

type ForEachSource<T> = readonly T[] | (() => readonly T[]);

export type ForProps<T, K extends string | number = string | number> = {
  each: ForEachSource<T>;
  fallback?: Renderable;
  children: (item: T, index: () => number) => Renderable;
} & (
  | { by: (item: T, index: number) => K; byIndex?: never }
  | { by?: never; byIndex: true }
);

interface RowRecord {
  readonly index: Signal<number>;
  readonly readIndex: () => number;
}

interface RowProps<T> extends Props {
  item: T;
  row: RowRecord;
  render: (item: T, index: () => number) => Renderable;
}

/** One list row: re-renders only when its item or the row callback changes. */
function ForRow<T>(props: RowProps<T>): Renderable {
  return props.render(props.item, props.row.readIndex);
}

function validateKey(key: unknown, index: number): void {
  if (key === null || key === undefined) {
    throw new Error(
      `[Askr] <For> key for the item at index ${index} is ${String(key)}; ` +
        '`by` must return a string or number.'
    );
  }
}

/** Render one row per item, keyed by `by` (or by position with `byIndex`). */
export function For<T, K extends string | number = string | number>(
  props: ForProps<T, K>
): Renderable {
  const by = props.by;
  if (!by && props.byIndex !== true) {
    throw new Error('[Askr] <For> requires either `by` or `byIndex={true}`.');
  }
  if (by && props.byIndex) {
    throw new Error('[Askr] <For> accepts `by` or `byIndex`, not both.');
  }
  const instance = currentComponent();
  const rows = instance
    ? hookSlot(instance, 'for', () => new Map<unknown, RowRecord>())
    : new Map<unknown, RowRecord>();
  const items = resolve(props.each) ?? [];
  if (items.length === 0) {
    if (instance) onCommit(instance, () => rows.clear());
    return isPresent(props.fallback)
      ? branch('for:fallback', props.fallback)
      : null;
  }

  const output: JSXElement[] = [];
  const positions: Array<[RowRecord, number]> = [];
  const live = new Set<unknown>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = by ? by(item, index) : index;
    validateKey(key, index);
    let row = rows.get(key);
    if (!row) {
      const signal = new Signal(index);
      row = { index: signal, readIndex: () => signal.read() };
      rows.set(key, row);
    } else {
      positions.push([row, index]);
    }
    live.add(key);
    output.push(
      element(
        ForRow,
        { item, row, render: props.children },
        key as string | number
      )
    );
  }

  if (instance) {
    onCommit(instance, () => {
      for (const key of rows.keys()) if (!live.has(key)) rows.delete(key);
      for (const [row, index] of positions) row.index.write(index);
    });
  }
  return output;
}
