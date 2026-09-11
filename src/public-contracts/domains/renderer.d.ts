import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { VNode, ContextFrame } from './context.js';
import { ComponentInstance, ReadableSource } from './component.js';
import { Scheduler } from './scheduler.js';

/**
 * Internal DOM range shape shared by runtime ownership records and the
 * renderer. A singleton range uses the node itself for both anchors; a
 * multi-node or empty range uses deterministic comment anchors.
 */
interface DOMRange {
  start: Node;
  end: Node;
  single: boolean;
}

interface ChildScope {
  key: string | number;
  componentInstance: ComponentInstance;
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom?: Node;
  /** @internal Fast singleton node plus an anchor-backed multi-node range. */
  range?: DOMRange;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  /** @internal Stable owner for validated intrinsic blueprints in list items. */
  blueprintOwner?: object;
  render(renderFn: () => VNode): VNode;
  markDirty(): void;
  dispose(): void;
}

interface ChildScopeOwnership {
  add(scope: ChildScope): void;
  delete(scope: ChildScope): void;
  bulkDispose(run: () => void): void;
}

/** @internal Snapshot used to restore a child scope after a failed commit. */
interface ChildScopeTransactionSnapshot {
  previousVnode: VNode | undefined;
  vnode: VNode | undefined;
  dom: Node | undefined;
  range: DOMRange | undefined;
  domTextData: string | undefined;
  needsDomUpdate: boolean;
  hydrationPending: boolean;
  renderFn: (() => VNode) | undefined;
  renderedOwnerFrame: ContextFrame | null;
}

/** Diagnostic breakdown of a keyed-list reorder decision, returned by {@link RuntimeRendererHost.isKeyedReorderFastPathEligible}. */
interface RuntimeKeyedReorderDecision {
  useFastPath: boolean;
  totalKeyed: number;
  totalChildren: number;
  currentKeyCount: number;
  moveCount: number;
  lisLen: number;
  hasPropChanges: boolean;
  isWholeKeyedList: boolean;
}

/** The renderer implementation an {@link AskrRuntime} delegates DOM evaluation and cleanup to. */
interface RuntimeRendererHost {
  evaluate(
    node: unknown,
    target: Element | null,
    context?: object,
    retainedOwner?: ComponentInstance
  ): void;
  cleanupInstancesUnder(node: Node): void;
  replaceComponentRange(
    instance: ComponentInstance,
    result: unknown,
    host: Element | Comment
  ): Node | null;
  resolveChildScopeRange?(scope: ChildScope): DOMRange | null;
  teardownNodeSubtree(root: Node): void;
  populateKeyMapForElement(parent: Element): void;
  getKeyMapForElement(
    parent: Element
  ): Map<string | number, Element> | undefined;
  isKeyedReorderFastPathEligible(
    parent: Element,
    children: unknown[],
    oldKeyMap: Map<string | number, Element> | undefined
  ): RuntimeKeyedReorderDecision;
  markReactivePropsDirtySource(source: ReadableSource<unknown>): void;
}

/** Options for {@link createRuntime}. */
interface AskrRuntimeOptions {
  scheduler?: Scheduler;
  renderer?: RuntimeRendererHost;
}

/** Construction-only scheduler and renderer wiring. Mounting uses the default runtime. */
declare class AskrRuntime {
  readonly scheduler: Scheduler;
  private rendererHost;
  constructor(options?: AskrRuntimeOptions);
  get renderer(): RuntimeRendererHost;
  configureRenderer(renderer: RuntimeRendererHost): void;
}

/** Create construction-only runtime wiring. Omitted schedulers share the default scheduler; mounting uses the default runtime. */
declare function createRuntime(options?: AskrRuntimeOptions): AskrRuntime;

/** Get the process-wide default {@link AskrRuntime}. */
declare function getDefaultRuntime(): AskrRuntime;
export {
  DOMRange,
  ChildScope,
  ChildScopeOwnership,
  ChildScopeTransactionSnapshot,
  RuntimeKeyedReorderDecision,
  RuntimeRendererHost,
  AskrRuntimeOptions,
  AskrRuntime,
  createRuntime,
  getDefaultRuntime,
};
