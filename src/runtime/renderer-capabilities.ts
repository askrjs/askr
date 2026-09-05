import { type ComponentInstance } from './component-internal';
import type { ChildScope } from './child-scope';
import type { ReadableSource } from './readable';
import type { DOMRange } from '../common/dom-range';

export interface RenderEvaluation {
  recordInlineComponentHost(
    instance: ComponentInstance,
    target: Element | null
  ): void;
  applyComponentResult(
    instance: ComponentInstance,
    result: unknown,
    strategy: 'ordinary' | 'keyed-reorder'
  ): boolean;
  classifyComponentUpdate(
    instance: ComponentInstance,
    result: unknown
  ): ComponentUpdateClassification;
  evaluate(
    node: unknown,
    target: Element | null,
    context?: object,
    retainedOwner?: ComponentInstance
  ): void;
  replaceComponentRange(
    instance: ComponentInstance,
    result: unknown,
    host: Element | Comment
  ): Node | null;
  resolveChildScopeRange?(scope: ChildScope): DOMRange | null;
}

export type ComponentUpdateClassification = Partial<KeyedReorderDecision> & {
  useFastPath: boolean;
  reason?: string;
};

export interface RenderCleanup {
  captureComponentHost(instance: ComponentInstance): (() => void) | undefined;
  releaseComponentHost(instance: ComponentInstance): void;
  detachPortalHostOutput(instance: ComponentInstance): void;
  isComponentHostDetached(instance: ComponentInstance): boolean;
  cleanupInstancesUnder(node: Node): void;
  teardownNodeSubtree(root: Node): void;
}

export interface ChildScopeHostSnapshot {
  restore(scope: ChildScope): void;
}

export interface ScopeBoundary {
  dom: Node | undefined;
  range: DOMRange | undefined;
}

export interface ScopeRendering {
  clearChildScopeHost(scope: ChildScope): void;
  captureChildScopeHost(scope: ChildScope): ChildScopeHostSnapshot | undefined;
  resolveScopeBoundary(scope: ChildScope): ScopeBoundary;
  prepareScopeRemoval(
    scope: ChildScope,
    nodes: Node[],
    ranges: DOMRange[],
    rollbackNodes: Node[]
  ): ScopeBoundary;
  recordRemovedScopeBoundary(
    dom: Node | undefined,
    range: DOMRange | undefined,
    nodes: Node[],
    ranges: DOMRange[]
  ): void;
  teardownScopeHost(
    dom: Node | undefined,
    range: DOMRange | undefined,
    onError?: (error: unknown) => void
  ): number;
  hasUnmountedComponentHost(node: Node | undefined): boolean;
}

export interface KeyedReorderDecision {
  useFastPath: boolean;
  totalKeyed: number;
  totalChildren: number;
  currentKeyCount: number;
  moveCount: number;
  lisLen: number;
  hasPropChanges: boolean;
  isWholeKeyedList: boolean;
}

export interface KeyedRendering {
  populateKeyMapForElement(parent: Element): void;
  getKeyMapForElement(
    parent: Element
  ): Map<string | number, Element> | undefined;
  isKeyedReorderFastPathEligible(
    parent: Element,
    children: unknown[],
    oldKeyMap: Map<string | number, Element> | undefined
  ): KeyedReorderDecision;
}

export interface ReactiveRendering {
  markReactivePropsDirtySource(source: ReadableSource<unknown>): void;
}

/** Renderer capabilities used by execution; independent of the extension API. */
export interface RendererCapabilities
  extends
    RenderEvaluation,
    RenderCleanup,
    ScopeRendering,
    KeyedRendering,
    ReactiveRendering {}
