import {
  __CONTROL_BOUNDARY__,
  markEagerControlPrimitive,
} from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import { createCaseState, type CaseState, type MatchBranch } from '../runtime';
import { state } from '../runtime';
import { type BoundaryChild, normalizeBoundaryChild } from './shared';

type MatchChild = BoundaryChild | (() => BoundaryChild);

export type MatchProps = {
  key?: string | number | null;
  when: unknown;
  children: MatchChild;
};

export type CaseProps = {
  fallback?: BoundaryChild;
  children?: unknown;
};

function flattenChildren(children: unknown): unknown[] {
  if (!Array.isArray(children)) {
    return children == null || children === false ? [] : [children];
  }

  const result: unknown[] = [];
  for (const child of children) {
    if (Array.isArray(child)) {
      result.push(...flattenChildren(child));
      continue;
    }
    result.push(child);
  }
  return result;
}

export function Match(_props: MatchProps): null {
  if (isDevelopmentEnvironment()) {
    throw new Error(
      '[askr] <Match> may only be used as a direct child of <Case>.'
    );
  }
  return null;
}

function createCaseFallbackRenderer(
  fallback: BoundaryChild | undefined
): (() => VNode) | null {
  const normalizedFallback = normalizeBoundaryChild(fallback);
  if (normalizedFallback == null || normalizedFallback === false) {
    return null;
  }
  return () => normalizedFallback;
}

function createMatchBranchKey(
  key: string | number | null | undefined,
  index: number
): string | number {
  if (key == null) {
    return index;
  }
  return `match:${index}:${typeof key}:${String(key)}`;
}

function readMatchBranches(children: unknown): MatchBranch[] {
  const branches: MatchBranch[] = [];
  const flatChildren = flattenChildren(children);

  for (let index = 0; index < flatChildren.length; index += 1) {
    const child = flatChildren[index];
    if (child == null || child === false) {
      continue;
    }

    if (
      typeof child === 'object' &&
      child !== null &&
      'type' in child &&
      (child as JSXElement).type === Match
    ) {
      const element = child as JSXElement;
      const props = (element.props ?? {}) as MatchProps;
      const key = createMatchBranchKey(element.key, index);
      const render =
        typeof props.children === 'function'
          ? () =>
              normalizeBoundaryChild(
                (props.children as () => BoundaryChild)()
              ) as VNode
          : () => normalizeBoundaryChild(props.children) as VNode;
      branches.push({
        key,
        render,
        when: props.when,
      });
      continue;
    }

    if (isDevelopmentEnvironment()) {
      throw new Error('[askr] <Case> only accepts <Match> children.');
    }
  }

  return branches;
}

function CasePrimitive(props: CaseProps): JSXElement {
  const matches = readMatchBranches(props.children);
  const fallback = createCaseFallbackRenderer(props.fallback);

  const caseStateContainer = state<CaseState>(
    createCaseState(matches, fallback)
  );
  const caseState = caseStateContainer();

  caseState.matches = matches;
  caseState.fallback = fallback;

  return {
    type: __CONTROL_BOUNDARY__,
    _controlState: caseState,
  } as unknown as JSXElement;
}

export const Case = markEagerControlPrimitive(
  CasePrimitive as (props: CaseProps) => JSXElement
) as (props: CaseProps) => JSXElement;
