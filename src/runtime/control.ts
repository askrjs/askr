import type { DOMRange } from '../common/dom-range';
import type { VNode } from '../common/vnode';
import { haveEquivalentContextFrames, type ContextFrame } from './context';
import {
  captureChildScopeTransactionSnapshot,
  createChildScope,
  disposeChildScope,
  restoreChildScopeTransactionSnapshot,
  type ChildScope,
  type ChildScopeTransactionSnapshot,
} from './child-scope';
import { getCurrentInstance, type ComponentInstance } from './component';
import type { ForState } from './for';
import { registerLifecycleTransaction } from './component-lifecycle';
import { getRuntimeRenderer } from './access';

export interface MatchBranch {
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

export interface ShowState extends BranchControlStateBase {
  kind: 'show';
  fallbackScope: ChildScope | null;
  renderFallback: (() => VNode) | null;
  renderTruthy: ((value: unknown) => VNode) | (() => VNode);
  selectedValue: unknown;
  truthyScope: ChildScope | null;
}

export interface CaseState extends BranchControlStateBase {
  kind: 'case';
  fallback: (() => VNode) | null;
  matches: MatchBranch[];
}

export type ControlBoundaryState = ForState<unknown> | ShowState | CaseState;

function setScopeContextFrame(
  scope: ChildScope | null,
  frame: ContextFrame
): void {
  if (scope) {
    scope.componentInstance.ownerFrame = frame;
  }
}

export function setControlBoundaryContextFrame(
  controlState: ControlBoundaryState,
  frame: ContextFrame
): void {
  const previousFrame = controlState._contextFrame;
  controlState._contextFrame = frame;

  if (controlState.kind === 'for') {
    controlState._contextFrameChanged ||=
      previousFrame !== null &&
      !haveEquivalentContextFrames(previousFrame, frame);
    setScopeContextFrame(controlState.fallbackScope, frame);
    for (const item of controlState.items.values()) {
      setScopeContextFrame(item.scope, frame);
    }
    return;
  }

  setScopeContextFrame(controlState.activeScope, frame);
  if (controlState.kind === 'show') {
    setScopeContextFrame(controlState.truthyScope, frame);
    setScopeContextFrame(controlState.fallbackScope, frame);
  }
}

const SHOW_TRUTHY_KEY = '__show-truthy__';
const SHOW_FALLBACK_KEY = '__show-fallback__';
const CASE_FALLBACK_KEY = '__case-fallback__';

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

export interface ControlTransaction {
  state: ShowState | CaseState;
  snapshot: BranchStateSnapshot;
  removedScopes: ChildScope[];
  shouldClearDomUpdateState: boolean;
  registered: boolean;
}

function getBranchScopes(state: ShowState | CaseState): ChildScope[] {
  const scopes: ChildScope[] = [];
  if (state.activeScope) scopes.push(state.activeScope);
  if (state instanceof Object && 'fallbackScope' in state) {
    if (state.fallbackScope) scopes.push(state.fallbackScope);
  }
  if (state instanceof Object && 'truthyScope' in state) {
    if (state.truthyScope) scopes.push(state.truthyScope);
  }
  return scopes;
}

function beginControlTransaction(
  state: ShowState | CaseState
): ControlTransaction {
  if (state._transaction) {
    return state._transaction;
  }

  const scopeSnapshots = new Map<ChildScope, ChildScopeTransactionSnapshot>();
  for (const scope of getBranchScopes(state)) {
    scopeSnapshots.set(scope, captureChildScopeTransactionSnapshot(scope));
  }

  const transaction: ControlTransaction = {
    state,
    snapshot: {
      activeKey: state.activeKey,
      activeScope: state.activeScope,
      activeVNodes: state.activeVNodes.slice(),
      lastRemovedNodes: state.lastRemovedNodes.slice(),
      lastRemovedRanges: state.lastRemovedRanges.slice(),
      scopeSnapshots,
      fallbackScope: 'fallbackScope' in state ? state.fallbackScope : undefined,
      truthyScope: 'truthyScope' in state ? state.truthyScope : undefined,
    },
    removedScopes: [],
    shouldClearDomUpdateState: false,
    registered: false,
  };
  state._transaction = transaction;
  transaction.registered = registerLifecycleTransaction(
    transaction,
    () => commitControlTransaction(state, transaction),
    () => rollbackControlTransaction(state, transaction)
  );
  return transaction;
}

function stageBranchRemoval(
  state: ShowState | CaseState,
  scope: ChildScope | null
): void {
  if (!scope) {
    return;
  }

  const transaction = state._transaction;
  if (transaction && !transaction.removedScopes.includes(scope)) {
    transaction.removedScopes.push(scope);
  } else if (!transaction) {
    disposeChildScope(scope);
  }

  const removedRange =
    getRuntimeRenderer().resolveChildScopeRange?.(scope) ?? scope.range;
  const removedDom = removedRange?.single ? removedRange.start : scope.dom;
  if (removedDom) {
    state.lastRemovedNodes.push(removedDom);
  }
  if (removedRange) {
    state.lastRemovedRanges.push(removedRange);
  }
}

function commitControlTransaction(
  state: ShowState | CaseState,
  transaction: ControlTransaction
): void {
  if (state._transaction !== transaction) {
    return;
  }

  const errors: unknown[] = [];
  for (const scope of transaction.removedScopes) {
    try {
      disposeChildScope(scope);
    } catch (error) {
      errors.push(error);
    }
  }

  if (transaction.shouldClearDomUpdateState) {
    if ('truthyScope' in state && state.truthyScope) {
      state.truthyScope.needsDomUpdate = false;
    }
    if ('fallbackScope' in state && state.fallbackScope) {
      state.fallbackScope.needsDomUpdate = false;
    }
    if (state.activeScope) {
      state.activeScope.needsDomUpdate = false;
    }
    state.lastRemovedNodes = [];
    state.lastRemovedRanges = [];
  }
  state._transaction = null;

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Control branch cleanup failed');
  }
}

function rollbackControlTransaction(
  state: ShowState | CaseState,
  transaction: ControlTransaction
): void {
  if (state._transaction !== transaction) {
    return;
  }

  const committedScopes = new Set(transaction.snapshot.scopeSnapshots.keys());
  const currentScopes = getBranchScopes(state);
  const errors: unknown[] = [];
  for (const scope of currentScopes) {
    if (committedScopes.has(scope)) {
      continue;
    }
    try {
      disposeChildScope(scope);
    } catch (error) {
      errors.push(error);
    }
  }

  state.activeKey = transaction.snapshot.activeKey;
  state.activeScope = transaction.snapshot.activeScope;
  state.activeVNodes = transaction.snapshot.activeVNodes;
  state.lastRemovedNodes = transaction.snapshot.lastRemovedNodes;
  state.lastRemovedRanges = transaction.snapshot.lastRemovedRanges;
  if ('truthyScope' in state) {
    state.truthyScope = transaction.snapshot.truthyScope ?? null;
  }
  if ('fallbackScope' in state) {
    state.fallbackScope = transaction.snapshot.fallbackScope ?? null;
  }
  for (const [scope, snapshot] of transaction.snapshot.scopeSnapshots) {
    restoreChildScopeTransactionSnapshot(scope, snapshot);
  }
  state._transaction = null;

  if (errors.length > 0) {
    throw new AggregateError(errors, 'Control branch rollback cleanup failed');
  }
}

function finishImmediateControlTransaction(
  state: ShowState | CaseState,
  transaction: ControlTransaction
): void {
  // A lifecycle batch owns the transaction when one is active. During SSR or
  // direct internal evaluation there is no batch, so a successful evaluation
  // can commit immediately after its branch has rendered.
  if (state._transaction === transaction && !transaction.registered) {
    commitControlTransaction(state, transaction);
  }
}

function createBranchScope(
  state: BranchControlStateBase,
  key: string | number
): ChildScope {
  const scope = createChildScope(state.parentInstance, key, () => {
    if (state._enqueueBoundaryCommit) {
      state._enqueueBoundaryCommit();
      return;
    }

    state.parentInstance?._enqueueRun?.();
  });
  if (state._contextFrame) {
    scope.componentInstance.ownerFrame = state._contextFrame;
  }
  return scope;
}

export function createShowState(
  value: unknown,
  renderTruthy: ShowState['renderTruthy'],
  renderFallback: ShowState['renderFallback']
): ShowState {
  return {
    kind: 'show',
    _contextFrame: null,
    activeKey: null,
    activeScope: null,
    activeVNodes: [],
    fallbackScope: null,
    lastRemovedNodes: [],
    lastRemovedRanges: [],
    parentInstance: getCurrentInstance(),
    _enqueueBoundaryCommit: null,
    _hasPendingBoundaryCommit: false,
    _transaction: null,
    renderFallback,
    renderTruthy,
    selectedValue: value,
    truthyScope: null,
  };
}

export function evaluateShowState(state: ShowState): VNode[] {
  const transaction = beginControlTransaction(state);
  state.lastRemovedNodes = [];
  state.lastRemovedRanges = [];
  try {
    if (state.selectedValue) {
      if (state.fallbackScope) {
        stageBranchRemoval(state, state.fallbackScope);
        state.fallbackScope = null;
      }

      const truthyScope =
        state.truthyScope ?? createBranchScope(state, SHOW_TRUTHY_KEY);
      state.truthyScope = truthyScope;
      state.activeScope = truthyScope;
      state.activeKey = SHOW_TRUTHY_KEY;

      const vnode = truthyScope.render(() =>
        state.renderTruthy(state.selectedValue)
      );
      state.activeVNodes = vnode == null || vnode === false ? [] : [vnode];
    } else {
      if (state.truthyScope) {
        stageBranchRemoval(state, state.truthyScope);
        state.truthyScope = null;
      }

      if (!state.renderFallback) {
        if (state.fallbackScope) {
          stageBranchRemoval(state, state.fallbackScope);
          state.fallbackScope = null;
        }
        state.activeKey = null;
        state.activeScope = null;
        state.activeVNodes = [];
      } else {
        const fallbackScope =
          state.fallbackScope ?? createBranchScope(state, SHOW_FALLBACK_KEY);
        state.fallbackScope = fallbackScope;
        state.activeScope = fallbackScope;
        state.activeKey = SHOW_FALLBACK_KEY;

        const vnode = fallbackScope.render(state.renderFallback);
        state.activeVNodes = vnode == null || vnode === false ? [] : [vnode];
      }
    }

    finishImmediateControlTransaction(state, transaction);
    return state.activeVNodes;
  } catch (error) {
    rollbackControlTransaction(state, transaction);
    throw error;
  }
}

export function clearShowDomUpdateState(state: ShowState): void {
  if (state.truthyScope) {
    state.truthyScope.needsDomUpdate = false;
  }
  if (state.fallbackScope) {
    state.fallbackScope.needsDomUpdate = false;
  }
  if (state._transaction) {
    state._transaction.shouldClearDomUpdateState = true;
    return;
  }
  state.lastRemovedNodes = [];
  state.lastRemovedRanges = [];
}

export function createCaseState(
  matches: MatchBranch[],
  fallback: (() => VNode) | null
): CaseState {
  return {
    kind: 'case',
    _contextFrame: null,
    activeKey: null,
    activeScope: null,
    activeVNodes: [],
    fallback,
    lastRemovedNodes: [],
    lastRemovedRanges: [],
    matches,
    parentInstance: getCurrentInstance(),
    _enqueueBoundaryCommit: null,
    _hasPendingBoundaryCommit: false,
    _transaction: null,
  };
}

export function evaluateCaseState(state: CaseState): VNode[] {
  const transaction = beginControlTransaction(state);
  state.lastRemovedNodes = [];
  state.lastRemovedRanges = [];
  try {
    const selectedMatch =
      state.matches.find((candidate) => Boolean(candidate.when)) ?? null;
    const nextKey =
      selectedMatch?.key ?? (state.fallback ? CASE_FALLBACK_KEY : null);

    if (nextKey === null) {
      if (state.activeScope) {
        stageBranchRemoval(state, state.activeScope);
      }
      state.activeKey = null;
      state.activeScope = null;
      state.activeVNodes = [];
    } else {
      if (state.activeScope && state.activeKey !== nextKey) {
        stageBranchRemoval(state, state.activeScope);
        state.activeScope = null;
      }

      const activeScope =
        state.activeScope ?? createBranchScope(state, nextKey);
      state.activeKey = nextKey;
      state.activeScope = activeScope;

      const renderBranch = selectedMatch?.render ?? state.fallback;
      const vnode = renderBranch ? activeScope.render(renderBranch) : null;
      state.activeVNodes = vnode == null || vnode === false ? [] : [vnode];
    }

    finishImmediateControlTransaction(state, transaction);
    return state.activeVNodes;
  } catch (error) {
    rollbackControlTransaction(state, transaction);
    throw error;
  }
}

export function clearCaseDomUpdateState(state: CaseState): void {
  if (state.activeScope) {
    state.activeScope.needsDomUpdate = false;
  }
  if (state._transaction) {
    state._transaction.shouldClearDomUpdateState = true;
    return;
  }
  state.lastRemovedNodes = [];
  state.lastRemovedRanges = [];
}
