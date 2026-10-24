/**
 * store(): a deep reactive proxy over plain objects and arrays.
 *
 * Each property read inside a computation subscribes to a per-property
 * version signal that is created on first tracked read. Assignments, deletes
 * and array mutations bump the signals they affect, so a reader of `a.x`
 * does not re-run when `a.y` changes. Nested plain objects and arrays are
 * wrapped lazily, one proxy per target.
 */

import { claimHook, requireInstance } from '../component/instance';
import { Signal, isTracking } from '../reactive/graph';
import { guardDerivedWrite, guardRenderWrite } from './state';

const RAW = Symbol('askr.store.raw');

interface Meta {
  proxy: object;
  /** Debug name, shown in write-guard errors. */
  name: string | null;
  /** One version signal per property key, created on a tracked read. */
  signals: Map<PropertyKey, Signal<number>> | null;
  /** Bumped when a key is added or removed. */
  keys: Signal<number> | null;
  /** Bumped on any change to an array; tracked by iteration. */
  version: Signal<number> | null;
}

const metas = new WeakMap<object, Meta>();

/** Array methods that walk the array; they track the whole array. */
const ITERATING = new Set<PropertyKey>([
  Symbol.iterator,
  'at',
  'concat',
  'entries',
  'every',
  'filter',
  'find',
  'findIndex',
  'findLast',
  'findLastIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'reduce',
  'reduceRight',
  'slice',
  'some',
  'toLocaleString',
  'toReversed',
  'toSorted',
  'toSpliced',
  'toString',
  'values',
  'with',
]);

function isWrappable(value: unknown): value is object {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function bump(signal: Signal<number> | null | undefined): void {
  if (signal) signal.write(signal._value + 1);
}

function signalFor(meta: Meta, key: PropertyKey): Signal<number> {
  const signals = (meta.signals ??= new Map());
  let signal = signals.get(key);
  if (!signal) {
    signal = new Signal(0);
    signals.set(key, signal);
  }
  return signal;
}

function isIndex(key: PropertyKey): boolean {
  return typeof key === 'string' && /^(?:0|[1-9]\d*)$/.test(key);
}

function metaOf(target: object): Meta {
  let meta = metas.get(target);
  if (!meta) {
    meta = {
      proxy: undefined as unknown as object,
      name: null,
      signals: null,
      keys: null,
      version: null,
    };
    meta.proxy = new Proxy(target, handlerFor(meta));
    metas.set(target, meta);
  }
  return meta;
}

function label(meta: Meta, action: string): string {
  return meta.name ? `store "${meta.name}" ${action}` : `store ${action}`;
}

const RAW_LOOKUPS = new Set<PropertyKey>([
  'includes',
  'indexOf',
  'lastIndexOf',
]);

function wrap(value: unknown): unknown {
  return isWrappable(value) ? metaOf(value).proxy : value;
}

/** The raw object behind a store proxy; any other value is returned as is. */
export function unwrap<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    const raw = (value as { [RAW]?: T })[RAW];
    if (raw !== undefined) return raw;
  }
  return value;
}

function handlerFor(meta: Meta): ProxyHandler<object> {
  return {
    get(target, key, receiver) {
      if (key === RAW) return target;
      const value = Reflect.get(target, key, receiver);
      // A frozen or otherwise non-configurable, non-writable property must
      // report its own value through a proxy (an engine invariant), so it is
      // returned raw and read without tracking.
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (
        descriptor &&
        descriptor.configurable === false &&
        descriptor.writable === false
      ) {
        return value;
      }
      if (Array.isArray(target) && RAW_LOOKUPS.has(key)) {
        // includes/indexOf compare against the raw elements, so the
        // application's own object references are found.
        if (isTracking()) (meta.version ??= new Signal(0)).read();
        return (search: unknown, ...rest: unknown[]) =>
          (
            Array.prototype[key as 'includes' | 'indexOf' | 'lastIndexOf'] as (
              this: unknown[],
              ...args: unknown[]
            ) => unknown
          ).call(target, unwrap(search), ...rest);
      }
      if (isTracking()) {
        if (Array.isArray(target) && ITERATING.has(key)) {
          (meta.version ??= new Signal(0)).read();
        }
        // Inherited members (array methods) are not data; absent keys are
        // tracked so adding them later notifies the reader.
        if (
          Object.prototype.hasOwnProperty.call(target, key) ||
          !(key in target)
        ) {
          signalFor(meta, key).read();
        }
      }
      return wrap(value);
    },

    has(target, key) {
      if (key === RAW) return true;
      if (isTracking()) (meta.keys ??= new Signal(0)).read();
      return Reflect.has(target, key);
    },

    ownKeys(target) {
      if (isTracking()) {
        (meta.keys ??= new Signal(0)).read();
        if (Array.isArray(target)) (meta.version ??= new Signal(0)).read();
      }
      return Reflect.ownKeys(target);
    },

    set(target, key, value) {
      guardRenderWrite(label(meta, 'assignment'));
      guardDerivedWrite(label(meta, 'assignment'));
      const raw = unwrap(value);
      const isArray = Array.isArray(target);
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      const previous = (target as Record<PropertyKey, unknown>)[key];
      if (hadKey && Object.is(previous, raw)) return true;
      const previousLength = isArray ? (target as unknown[]).length : 0;
      if (isArray && key === 'length') {
        // Truncation removes the elements at and beyond the new length.
        const next = Number(raw);
        if (next < previousLength && meta.signals) {
          for (const [signalKey, signal] of meta.signals) {
            if (isIndex(signalKey) && Number(signalKey) >= next) bump(signal);
          }
        }
        if (next < previousLength) bump(meta.keys);
      }
      if (!Reflect.set(target, key, raw)) return false;
      bump(meta.signals?.get(key));
      if (!hadKey) bump(meta.keys);
      if (isArray) {
        const length = (target as unknown[]).length;
        if (length !== previousLength && key !== 'length') {
          bump(meta.signals?.get('length'));
        }
        bump(meta.version);
      }
      return true;
    },

    deleteProperty(target, key) {
      guardRenderWrite(label(meta, 'delete'));
      guardDerivedWrite(label(meta, 'delete'));
      const hadKey = Object.prototype.hasOwnProperty.call(target, key);
      if (!Reflect.deleteProperty(target, key)) return false;
      if (hadKey) {
        bump(meta.signals?.get(key));
        bump(meta.keys);
        if (Array.isArray(target)) bump(meta.version);
      }
      return true;
    },
  };
}

/**
 * Create a reactive store outside any component. Prefer `store()` in
 * components; this exists for tests and shared modules.
 */
export function createStore<T extends object>(
  initial: T,
  options?: StoreOptions
): T {
  const meta = metaOf(unwrap(initial));
  if (options?.name) meta.name = options.name;
  return meta.proxy as T;
}

export interface StoreOptions {
  /** Debug name used in diagnostics. */
  name?: string;
}

/** Component hook: a deep reactive proxy that persists across renders. */
export function store<T extends object>(initial: T, options?: StoreOptions): T {
  const instance = requireInstance('store()');
  const index = claimHook(instance, 'store');
  const existing = instance.hooks[index] as T | undefined;
  if (existing) return existing;
  const created = createStore(initial, options);
  instance.hooks[index] = created;
  return created;
}
