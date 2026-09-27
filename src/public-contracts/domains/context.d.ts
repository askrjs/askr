import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { SSRContext } from './server.js';

interface DOMElement {
  type: JSXElementType;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
}

type VNode = DOMElement | string | number | boolean | null | undefined;

type RenderableChild = VNode | JSXElement | readonly RenderableChild[];

type ComponentContext = {
  signal: AbortSignal;
  ssr?: SSRContext;
};

type ComponentFunction = (
  props: Props,
  context?: ComponentContext
) => JSXElement | VNode;

type ContextKey = symbol;

type Renderable = RenderableChild;

type ContextScopeChildren = Renderable | (() => Renderable);

/** A lexical scope created by {@link defineScope}; render it as a provider component, read it with {@link readScope}. */
interface Scope<T> {
  (props: { value: T; children?: ContextScopeChildren }): JSXElement;
  readonly key: ContextKey;
  readonly defaultValue: T;
}

declare function defineScope<T>(defaultValue: T): Scope<T>;

/** Read the current value of a {@link Scope} during component render or an async resource. */
declare function readScope<T>(context: Scope<T>): T;

export {
  DOMElement,
  VNode,
  RenderableChild,
  ComponentContext,
  ComponentFunction,
  ContextKey,
  Renderable,
  ContextScopeChildren,
  Scope,
  defineScope,
  readScope,
};
