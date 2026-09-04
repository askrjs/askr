import type { ComponentInstance } from './component';
import type { ChildScope } from './child-scope';
import type { ReadableSource } from './readable';
import type { DOMRange } from '../common/dom-range';

export interface RenderEvaluation {
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

export interface RenderCleanup {
  cleanupInstancesUnder(node: Node): void;
  teardownNodeSubtree(root: Node): void;
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
  extends RenderEvaluation, RenderCleanup, KeyedRendering, ReactiveRendering {}
