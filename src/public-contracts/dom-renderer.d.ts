import type {
  RuntimeRendererHost,
  RuntimeKeyedReorderDecision,
} from './core.js';

declare const ownerBrand: unique symbol;
declare const scopeBrand: unique symbol;
declare const sourceBrand: unique symbol;
/** Opaque component identity scoped to one DOM renderer factory. */
export interface DOMComponentOwner {
  readonly [ownerBrand]: never;
}
/** Opaque child scope identity scoped to one DOM renderer factory. */
export interface DOMChildScope {
  readonly [scopeBrand]: never;
}
/** Opaque reactive source identity scoped to one DOM renderer factory. */
export interface DOMReactiveSource {
  readonly [sourceBrand]: never;
}
/** Read-only boundary of rendered DOM output. */
export interface DOMRendererRange {
  readonly start: Node;
  readonly end: Node;
  readonly single: boolean;
}
/** DOM evaluation and replacement operations. */
export interface DOMRendererEvaluation {
  evaluate(
    node: unknown,
    target: Element | null,
    context?: object,
    retainedOwner?: DOMComponentOwner
  ): void;
  replaceComponentRange(
    owner: DOMComponentOwner,
    result: unknown,
    host: Element | Comment
  ): Node | null;
}
/** DOM lifetime cleanup operations. */
export interface DOMRendererCleanup {
  cleanupInstancesUnder(node: Node): void;
  teardownNodeSubtree(root: Node): void;
}
/** Child scope boundary inspection. */
export interface DOMRendererScopes {
  resolveChildScopeRange(scope: DOMChildScope): DOMRendererRange | null;
}
/** Keyed DOM reconciliation operations. */
export interface DOMRendererKeys {
  populateKeyMapForElement(parent: Element): void;
  getKeyMapForElement(
    parent: Element
  ): Map<string | number, Element> | undefined;
  isKeyedReorderFastPathEligible(
    parent: Element,
    children: unknown[],
    oldKeyMap: Map<string | number, Element> | undefined
  ): RuntimeKeyedReorderDecision;
}
/** Reactive DOM invalidation operations. */
export interface DOMRendererReactivity {
  markReactivePropsDirtySource(source: DOMReactiveSource): void;
}
/** Complete DOM extension roles. Delegate explicitly to the supplied native host. */
export interface DOMRendererHost {
  evaluation: DOMRendererEvaluation;
  cleanup: DOMRendererCleanup;
  scopes: DOMRendererScopes;
  keys: DOMRendererKeys;
  reactivity: DOMRendererReactivity;
}
/** Construct a validated DOM adapter without installing it in a runtime. */
export declare function createDOMRendererHost(
  configure: (native: DOMRendererHost) => DOMRendererHost
): RuntimeRendererHost;
