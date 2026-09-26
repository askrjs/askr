/**
 * Lexical scopes. A scope's provider is a component that records its value
 * on its own lifetime; `readScope()` finds the nearest provider by walking up
 * the owner tree from the code that is running.
 */

import { ELEMENT_TYPE, type JSXElement } from '../../common/jsx';
import { getOwner } from '../reactive/owner';
import { currentComponent } from './hooks';

type ScopeChildren = unknown;

/** A lexical scope created by {@link defineScope}. */
export interface Scope<T> {
  (props: { value: T; children?: ScopeChildren }): JSXElement;
  readonly key: symbol;
  readonly defaultValue: T;
}

interface ProviderProps {
  scopeKey: symbol;
  value: unknown;
  children?: ScopeChildren;
}

function ScopeProvider(props: ProviderProps): unknown {
  const instance = currentComponent();
  if (instance) {
    (instance.context ??= new Map()).set(props.scopeKey, props.value);
  }
  return typeof props.children === 'function'
    ? (props.children as () => unknown)()
    : props.children;
}

/** Create a scope whose value defaults to `defaultValue`. */
export function defineScope<T>(defaultValue: T): Scope<T> {
  const key = Symbol('AskrScope');
  const scope = (props: { value: T; children?: ScopeChildren }): JSXElement =>
    ({
      $$typeof: ELEMENT_TYPE,
      type: ScopeProvider,
      props: { scopeKey: key, value: props.value, children: props.children },
      key: null,
    }) as unknown as JSXElement;
  return Object.assign(scope, { key, defaultValue });
}

const NOT_FOUND = Symbol('not-found');

/** Whether `readScope()` can run here (inside a render or owned callback). */
export function isScopeReadable(): boolean {
  return getOwner() !== null;
}

/** Read the nearest provided value of `scope`, or its default. */
export function readScope<T>(scope: Scope<T>): T {
  const owner = getOwner();
  if (!owner) {
    throw new Error(
      'readScope() can only be called during component render or async resource execution. ' +
        'Ensure you are calling this from inside your component or resource function.'
    );
  }
  const value = lookup(owner, scope.key);
  return value === NOT_FOUND ? scope.defaultValue : (value as T);
}

function lookup(
  owner: { context: Map<unknown, unknown> | null; parent: unknown },
  key: symbol
): unknown {
  for (
    let o = owner as typeof owner | null;
    o;
    o = o.parent as typeof owner | null
  ) {
    if (o.context?.has(key)) return o.context.get(key);
  }
  return NOT_FOUND;
}
