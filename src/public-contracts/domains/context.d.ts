import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { SSRContext } from './server.js';
import { ControlBoundaryState } from './control.js';

interface DOMElement {
  type: JSXElementType;
  props?: Props;
  children?: VNode[];
  key?: string | number | null;
  [Symbol.iterator]?: never;
  _controlState?: ControlBoundaryState;
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

interface ContextFrame {
  parent: ContextFrame | null;
  values: Map<ContextKey, unknown> | null;
}

/** Create a new lexical {@link Scope} with `defaultValue`, readable via {@link readScope}. */
declare function defineScope<T>(defaultValue: T): Scope<T>;

/** Read the current value of a {@link Scope} during component render or an async resource. */
declare function readScope<T>(context: Scope<T>): T;

type OwnedChildScope = {
  key: string | number;
  dispose(): void;
};
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
  ContextFrame,
  defineScope,
  readScope,
  OwnedChildScope,
};
