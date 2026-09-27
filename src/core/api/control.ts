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
import { isDevelopmentEnvironment } from '../../common/env';
import { logger } from '../../common/logger';
import type { Props } from '../../common/props';
import { recordUndo } from '../component/journal';
import { isRendering } from '../component/render-state';
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

/** A list, or a getter returning one (`null`/`undefined` render nothing). */
type ForEachSource<T> = ForEachGetter<T> | ForEachList<T>;

type ForEachGetter<T> = () => readonly T[] | null | undefined;

/** A list that is not also callable: a `state()` getter is both. */
type ForEachList<T> = readonly T[] & { readonly call?: never };

/** How rows are identified: by a key function, or by position. */
type ForKeying<T, K extends string | number> =
  | { by: (item: T, index: number) => K; byIndex?: never }
  | { by?: never; byIndex: true };

type ForRowProps<T> = {
  fallback?: Renderable;
  children: (item: T, index: () => number) => Renderable;
};

export type ForProps<T, K extends string | number = string | number> = {
  each: ForEachSource<T>;
} & ForRowProps<T> &
  ForKeying<T, K>;

interface RowRecord {
  readonly index: Signal<number>;
  readonly readIndex: () => number;
  readonly source: Signal<unknown>;
  readonly readItem: () => unknown;
  /** Replace the item, notifying only readers of properties that changed. */
  writeItem(item: unknown): void;
}

interface RowProps<T> extends Props {
  item: T;
  row: RowRecord;
  render: (item: T, index: () => number) => Renderable;
}

/** One list row: re-renders only when its item or the row callback changes. */
function ForRow<T>(props: RowProps<T>): Renderable {
  return props.render(props.row.readItem() as T, props.row.readIndex);
}

function recordRowUndo(undo: () => void): void {
  if (isRendering() && !currentComponent()?.server) recordUndo(undo);
}

function createRow(index: number, item: unknown): RowRecord {
  const indexSource = new Signal(index);
  const source = new Signal<unknown>(item);
  const overlay = new Map<string | symbol, PropertyDescriptor>();
  const deleted = new Set<string | symbol>();
  /** One signal per property a reader has read through the proxy. */
  const properties = new Map<string | symbol, Signal<unknown>>();
  let proxy: object | null = null;
  const readProperty = (key: string | symbol): unknown => {
    let property = properties.get(key);
    if (!property) {
      property = new Signal(Reflect.get(source.peek() as object, key));
      properties.set(key, property);
      // Created from an item a discarded render may rewind: forget it then,
      // so the next read starts from the item the row actually holds.
      recordRowUndo(() => properties.delete(key));
    }
    return property.read();
  };
  const row: RowRecord = {
    index: indexSource,
    readIndex: () => indexSource.read(),
    source,
    readItem: () => {
      const item = source.peek();
      if (typeof item !== 'object' || item === null || Array.isArray(item)) {
        return item;
      }
      if (proxy) return proxy;
      proxy = new Proxy(
        {},
        {
          get(_target, key) {
            if (deleted.has(key)) return undefined;
            const own = overlay.get(key);
            if (own) return own.get ? own.get.call(proxy) : own.value;
            return readProperty(key);
          },
          set(_target, key, value) {
            const previous = overlay.get(key);
            if (
              !previous &&
              typeof key !== 'symbol' &&
              isDevelopmentEnvironment() &&
              key in Object(source.peek())
            ) {
              logger.warn(
                `[Askr] Assigning to "${String(key)}" on a <For> item shadows a ` +
                  `property from the source data - it will not update when the ` +
                  `source item changes and does not trigger a re-render. Use a ` +
                  `different property name for cached/derived per-row values, or ` +
                  `a state() cell for values that should be reactive.`
              );
            }
            const wasDeleted = deleted.delete(key);
            overlay.set(key, {
              value,
              writable: true,
              enumerable: true,
              configurable: true,
            });
            recordRowUndo(() => {
              if (previous) overlay.set(key, previous);
              else overlay.delete(key);
              if (wasDeleted) deleted.add(key);
            });
            return true;
          },
          has(_target, key) {
            return (
              !deleted.has(key) &&
              (overlay.has(key) || Reflect.has(source.read() as object, key))
            );
          },
          ownKeys() {
            return [
              ...overlay.keys(),
              ...Reflect.ownKeys(source.read() as object).filter(
                (key) => !overlay.has(key) && !deleted.has(key)
              ),
            ];
          },
          getOwnPropertyDescriptor(_target, key) {
            if (deleted.has(key)) return undefined;
            const descriptor =
              overlay.get(key) ??
              Reflect.getOwnPropertyDescriptor(source.read() as object, key);
            return descriptor
              ? { ...descriptor, configurable: true }
              : undefined;
          },
          getPrototypeOf() {
            return Reflect.getPrototypeOf(source.read() as object);
          },
          deleteProperty(_target, key) {
            const previous = overlay.get(key);
            const wasDeleted = deleted.has(key);
            overlay.delete(key);
            deleted.add(key);
            recordRowUndo(() => {
              if (previous) overlay.set(key, previous);
              if (!wasDeleted) deleted.delete(key);
            });
            return true;
          },
        }
      );
      return proxy;
    },
    writeItem(item: unknown): void {
      const previousItem = source.peek();
      if (!source.write(item)) return;
      recordRowUndo(() => {
        source.write(previousItem);
      });
      if (typeof item !== 'object' || item === null) return;
      for (const [key, property] of properties) {
        const previous = property.peek();
        if (property.write(Reflect.get(item, key))) {
          recordRowUndo(() => {
            property.write(previous);
          });
        }
      }
    },
  };
  return row;
}

function validateKey(key: unknown, index: number): void {
  if (key === null || key === undefined) {
    throw new Error(
      `[askr] Invalid For key detected at index ${index}: ${String(key)}. ` +
        'Keys should be stable, non-null, and unique within a For list.'
    );
  }
}

export type ForGetterProps<T, K extends string | number = string | number> = {
  each: ForEachGetter<T>;
} & ForRowProps<T> &
  ForKeying<T, K>;

/** Render one row per item, keyed by `by` (or by position with `byIndex`). */
// A `state()` getter is also an array (`[getter, setter]`): the getter overload
// comes first so its items keep their element type.
export function For<T, K extends string | number = string | number>(
  props: ForGetterProps<T, K>
): Renderable;
export function For<T, K extends string | number = string | number>(
  props: ForProps<T, K>
): Renderable;
export function For<T, K extends string | number = string | number>(
  props: ForProps<T, K> | ForGetterProps<T, K>
): Renderable {
  const by = props.by;
  if (!by && props.byIndex !== true) {
    throw new Error(
      '[Askr] <For> requires a stable `by` key function or `byIndex={true}`.'
    );
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
  const live = new Set<unknown>();
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    const key = by ? by(item, index) : index;
    validateKey(key, index);
    if (live.has(key)) {
      throw new Error(
        `[askr] Duplicate For key detected: ${String(key)}. ` +
          'Keys should be stable, non-null, and unique within a For list.'
      );
    }
    let row = rows.get(key);
    if (!row) {
      row = createRow(index, item);
      rows.set(key, row);
      recordRowUndo(() => rows.delete(key));
    } else {
      const indexSource = row.index;
      const previous = indexSource.peek();
      if (indexSource.write(index)) {
        recordRowUndo(() => indexSource.write(previous));
      }
      row.writeItem(item);
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
    });
  }
  return output;
}
