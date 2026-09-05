import { JSXElementType, JSXElement, Props } from '../elements.js';
import '../jsx-globals.js';
import { AuthContext, AuthRequirement } from '@askrjs/auth';
import { InferSchema, ObjectSchema } from '@askrjs/schema';
import { state, selector } from './state.js';
import { VNode, RenderableChild, ContextFrame } from './context.js';
import { ComponentInstance, ReadableSource } from './component.js';
import {
  DOMRange,
  ChildScope,
  ChildScopeOwnership,
  ChildScopeTransactionSnapshot,
} from './renderer.js';
import { on } from './lifecycle.js';

type ForItemSignal<T> = ReadableSource<T> &
  (() => T) & {
    peek(): T;
    set(newValue: T, notifyReaders?: boolean): void;
  };

type ForItemPropertySignal = ReadableSource<unknown> &
  (() => unknown) & {
    peek(): unknown;
    set(newValue: unknown, notifyReaders?: boolean): void;
  };

type ForIndexSignal = ReadableSource<number> &
  (() => number) & {
    peek(): number;
    set(
      newValue: number | ((prev: number) => number),
      notifyReaders?: boolean
    ): void;
  };

interface ReactiveForItemState<T> {
  currentItem: T;
  itemSignal: ForItemSignal<T> | null;
  propertySignals: Map<PropertyKey, ForItemPropertySignal> | null;
  coalescedProperties: PropertyKey | PropertyKey[] | null;
  coalescedProperty2: PropertyKey | null;
  wholeItemRead: boolean;
  proxy: T;
}

interface ForItemInstance<T> {
  key: string | number;
  item: T;
  reactiveItem: T;
  reactiveItemState: ReactiveForItemState<T> | null;
  indexSignal: ForIndexSignal;
  scope: ChildScope;
}

interface FineGrainedEffectHandle<T> {
  cleanup(): void;
  updateCompute(nextCompute: () => T): void;
  flush(): void;
}

type ForEachSource<T> = readonly T[] | (() => readonly T[]);

type ForKeySelector<T> = (item: T, index: number) => string | number;

type ForRenderItem<T> = (item: T, index: () => number) => VNode;

type ForCommitStrategy =
  | 'APPEND'
  | 'INSERT_ONE'
  | 'REMOVE_ONE'
  | 'TRUNCATE'
  | 'NO_REORDER'
  | 'SWAP'
  | 'FULL_KEYED';

interface ForState<T> {
  kind: 'for';
  _contextFrame: ContextFrame | null;
  _contextFrameChanged: boolean;
  currentItems: readonly T[];
  _committedItems: readonly T[];
  eachSource: ForEachSource<T>;
  fallback: VNode | null;
  fallbackScope: ChildScope | null;
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  byFn: ForKeySelector<T>;
  renderFn: ForRenderItem<T>;
  parentInstance: ComponentInstance | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  _hasResolvedItemDom: boolean;
  _needsSourceReconcile: boolean;
  _sourceEffect: FineGrainedEffectHandle<readonly T[]> | null;
  _suspendSourceCommit: boolean;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  _transaction?: ForTransaction<T> | null;
  _scopeOwnership: ChildScopeOwnership;
}

interface ForItemTransactionSnapshot<T> {
  item: T;
  itemSignalExists: boolean;
  itemSignalValue: T | undefined;
  itemSignalHasBeenRead: boolean;
  indexValue: number;
  indexHasBeenRead: boolean;
  propertySignalStore: Map<PropertyKey, ForItemPropertySignal> | null;
  propertySignals: Map<
    PropertyKey,
    {
      signal: ForItemPropertySignal;
      value: unknown;
      hasBeenRead: boolean;
    }
  > | null;
  scope: ChildScopeTransactionSnapshot;
}

interface ForTransaction<T> {
  collectionSnapshotMode: 'copy' | 'reset-empty' | 'preserve-clear' | 'reuse';
  currentItems: readonly T[];
  items: Map<string | number, ForItemInstance<T>>;
  orderedKeys: Array<string | number>;
  orderedItems: ForItemInstance<T>[];
  orderedVNodes: VNode[];
  fallbackScope: ChildScope | null;
  lastCommitStrategy: ForCommitStrategy;
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  pendingDirtyIndices: number[] | null;
  pendingSwapIndices: [number, number] | null;
  pendingMoveOnly: boolean;
  pendingInsertedIndex: number | null;
  pendingRemovedKey: string | number | null;
  pendingAppendStart: number | null;
  hasResolvedItemDom: boolean;
  needsSourceReconcile: boolean;
  devKeyKinds?: Map<string | number, 'number' | 'string'>;
  itemSnapshots: Map<ForItemInstance<T>, ForItemTransactionSnapshot<T>> | null;
  unreadIndexSnapshots: Map<ForIndexSignal, number> | null;
  fallbackScopeSnapshot: ChildScopeTransactionSnapshot | null;
  removedScopes: ChildScope[] | null;
  removedScopeNodes: Node[] | null;
  removeAllItems: boolean;
  signalEffects: Map<
    ReadableSource<unknown>,
    {
      parentInstance: ComponentInstance | null;
      notify: boolean;
      skipInstance: ComponentInstance | null;
      skipOwnedBy: ComponentInstance | null;
    }
  > | null;
  shouldClearDomUpdateState: boolean;
}

interface MatchBranch {
  key: string | number;
  render: () => VNode;
  when: unknown;
}

interface BranchControlStateBase {
  _contextFrame: ContextFrame | null;
  activeKey: string | number | null;
  activeScope: ChildScope | null;
  activeVNodes: VNode[];
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  parentInstance: ComponentInstance | null;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
  _transaction?: ControlTransaction | null;
}

interface ShowState extends BranchControlStateBase {
  kind: 'show';
  fallbackScope: ChildScope | null;
  renderFallback: (() => VNode) | null;
  renderTruthy: ((value: unknown) => VNode) | (() => VNode);
  selectedValue: unknown;
  truthyScope: ChildScope | null;
}

interface CaseState extends BranchControlStateBase {
  kind: 'case';
  fallback: (() => VNode) | null;
  matches: MatchBranch[];
}

type ControlBoundaryState = ForState<unknown> | ShowState | CaseState;

type BranchStateSnapshot = {
  activeKey: string | number | null;
  activeScope: ChildScope | null;
  activeVNodes: VNode[];
  lastRemovedNodes: Node[];
  lastRemovedRanges: DOMRange[];
  scopeSnapshots: Map<ChildScope, ChildScopeTransactionSnapshot>;
  fallbackScope?: ChildScope | null;
  truthyScope?: ChildScope | null;
};

interface ControlTransaction {
  state: ShowState | CaseState;
  snapshot: BranchStateSnapshot;
  removedScopes: ChildScope[];
  shouldClearDomUpdateState: boolean;
  registered: boolean;
}

type BoundaryChild = RenderableChild;

type ForBaseProps<T> = {
  each: ForEachSource<T>;
  fallback?: BoundaryChild;
  /**
   * Row renderer. Parent reactive reads must use `selector()` or thunk props;
   * closure-captured values are snapshotted when the row is created or
   * reconciled; changing the parent source does not rerun an existing row.
   */
  children: (item: T, index: () => number) => VNode;
};

type KeyedForProps<T, K extends string | number> = ForBaseProps<T> & {
  by: (item: T, index: number) => K;
  byIndex?: never;
};

type IndexedForProps<T> = ForBaseProps<T> & {
  by?: never;
  byIndex: true;
};

/** Props for {@link For}. */
type ForProps<T, K extends string | number = string | number> =
  | KeyedForProps<T, K>
  | IndexedForProps<T>;

/** Render a keyed or indexed list, reconciling items by key instead of position. */
declare const For: <T, K extends string | number = string | number>(
  props: ForProps<T, K>
) => JSXElement;

type ShowSource<T> = T | (() => T);

type Truthy<T> = T extends false | '' | 0 | 0n | null | undefined ? never : T;

/** Props for {@link Show}. */
type ShowProps<T> = {
  when: ShowSource<T>;
  fallback?: BoundaryChild;
  children: BoundaryChild | ((value: Truthy<T>) => BoundaryChild);
};

/** Conditionally render children based on `when`, narrowing truthy values for the render function form. */
declare const Show: <T>(props: ShowProps<T>) => JSXElement;

type MatchChild = BoundaryChild | (() => BoundaryChild);

/** Props for {@link Match}, valid only as a direct child of {@link Case}. */
type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: MatchChild;
};

/** Props for {@link Case}. */
type CaseProps = {
  fallback?: BoundaryChild;
  children?: unknown;
};

/** Declares one branch of a {@link Case}; only valid as its direct child. */
declare function Match(_props: MatchProps): null;

/** Render the first matching {@link Match} child (by `when`), or `fallback` if none match. */
declare const Case: (props: CaseProps) => JSXElement;
export {
  ForItemSignal,
  ForItemPropertySignal,
  ForIndexSignal,
  ReactiveForItemState,
  ForItemInstance,
  FineGrainedEffectHandle,
  ForEachSource,
  ForKeySelector,
  ForRenderItem,
  ForCommitStrategy,
  ForState,
  ForItemTransactionSnapshot,
  ForTransaction,
  MatchBranch,
  BranchControlStateBase,
  ShowState,
  CaseState,
  ControlBoundaryState,
  BranchStateSnapshot,
  ControlTransaction,
  BoundaryChild,
  ForBaseProps,
  KeyedForProps,
  IndexedForProps,
  ForProps,
  For,
  ShowSource,
  Truthy,
  ShowProps,
  Show,
  MatchChild,
  MatchProps,
  CaseProps,
  Match,
  Case,
};
