import type { VNode } from '../common/vnode';
import {
  createChildScope,
  disposeChildScope,
  type ChildScope,
} from './child-scope';
import { getCurrentInstance, type ComponentInstance } from './component';
import type { ForState } from './for';

export interface MatchBranch {
  key: string | number;
  render: () => VNode;
  when: unknown;
}

interface BranchControlStateBase {
  activeKey: string | number | null;
  activeScope: ChildScope | null;
  activeVNodes: VNode[];
  lastRemovedNodes: Node[];
  parentInstance: ComponentInstance | null;
  _enqueueBoundaryCommit?: (() => void) | null;
  _hasPendingBoundaryCommit?: boolean;
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

const SHOW_TRUTHY_KEY = '__show-truthy__';
const SHOW_FALLBACK_KEY = '__show-fallback__';
const CASE_FALLBACK_KEY = '__case-fallback__';

function disposeBranchScope(
  state: BranchControlStateBase,
  scope: ChildScope | null
): void {
  if (!scope) {
    return;
  }
  const removedDom = scope.dom;
  disposeChildScope(scope);
  if (removedDom) {
    state.lastRemovedNodes.push(removedDom);
  }
}

function createBranchScope(
  state: BranchControlStateBase,
  key: string | number
): ChildScope {
  return createChildScope(state.parentInstance, key, () => {
    if (state._enqueueBoundaryCommit) {
      state._enqueueBoundaryCommit();
      return;
    }

    state.parentInstance?._enqueueRun?.();
  });
}

export function createShowState(
  value: unknown,
  renderTruthy: ShowState['renderTruthy'],
  renderFallback: ShowState['renderFallback']
): ShowState {
  return {
    kind: 'show',
    activeKey: null,
    activeScope: null,
    activeVNodes: [],
    fallbackScope: null,
    lastRemovedNodes: [],
    parentInstance: getCurrentInstance(),
    _enqueueBoundaryCommit: null,
    _hasPendingBoundaryCommit: false,
    renderFallback,
    renderTruthy,
    selectedValue: value,
    truthyScope: null,
  };
}

export function evaluateShowState(state: ShowState): VNode[] {
  state.lastRemovedNodes = [];

  if (state.selectedValue) {
    if (state.fallbackScope) {
      disposeBranchScope(state, state.fallbackScope);
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
    return state.activeVNodes;
  }

  if (state.truthyScope) {
    disposeBranchScope(state, state.truthyScope);
    state.truthyScope = null;
  }

  if (!state.renderFallback) {
    if (state.fallbackScope) {
      disposeBranchScope(state, state.fallbackScope);
      state.fallbackScope = null;
    }
    state.activeKey = null;
    state.activeScope = null;
    state.activeVNodes = [];
    return state.activeVNodes;
  }

  const fallbackScope =
    state.fallbackScope ?? createBranchScope(state, SHOW_FALLBACK_KEY);
  state.fallbackScope = fallbackScope;
  state.activeScope = fallbackScope;
  state.activeKey = SHOW_FALLBACK_KEY;

  const vnode = fallbackScope.render(state.renderFallback);
  state.activeVNodes = vnode == null || vnode === false ? [] : [vnode];
  return state.activeVNodes;
}

export function clearShowDomUpdateState(state: ShowState): void {
  if (state.truthyScope) {
    state.truthyScope.needsDomUpdate = false;
  }
  if (state.fallbackScope) {
    state.fallbackScope.needsDomUpdate = false;
  }
  state.lastRemovedNodes = [];
}

export function createCaseState(
  matches: MatchBranch[],
  fallback: (() => VNode) | null
): CaseState {
  return {
    kind: 'case',
    activeKey: null,
    activeScope: null,
    activeVNodes: [],
    fallback,
    lastRemovedNodes: [],
    matches,
    parentInstance: getCurrentInstance(),
    _enqueueBoundaryCommit: null,
    _hasPendingBoundaryCommit: false,
  };
}

export function evaluateCaseState(state: CaseState): VNode[] {
  state.lastRemovedNodes = [];

  const selectedMatch =
    state.matches.find((candidate) => Boolean(candidate.when)) ?? null;
  const nextKey =
    selectedMatch?.key ?? (state.fallback ? CASE_FALLBACK_KEY : null);

  if (nextKey === null) {
    if (state.activeScope) {
      disposeBranchScope(state, state.activeScope);
    }
    state.activeKey = null;
    state.activeScope = null;
    state.activeVNodes = [];
    return state.activeVNodes;
  }

  if (state.activeScope && state.activeKey !== nextKey) {
    disposeBranchScope(state, state.activeScope);
    state.activeScope = null;
  }

  const activeScope = state.activeScope ?? createBranchScope(state, nextKey);
  state.activeKey = nextKey;
  state.activeScope = activeScope;

  const renderBranch = selectedMatch?.render ?? state.fallback;
  const vnode = renderBranch ? activeScope.render(renderBranch) : null;
  state.activeVNodes = vnode == null || vnode === false ? [] : [vnode];
  return state.activeVNodes;
}

export function clearCaseDomUpdateState(state: CaseState): void {
  if (state.activeScope) {
    state.activeScope.needsDomUpdate = false;
  }
  state.lastRemovedNodes = [];
}
