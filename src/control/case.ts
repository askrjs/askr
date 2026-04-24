import {
  __CONTROL_BOUNDARY__,
  markEagerControlPrimitive,
} from '../common/control';
import type { JSXElement } from '../common/jsx';
import type { VNode } from '../common/vnode';
import { isDevelopmentEnvironment } from '../common/env';
import {
  createCaseState,
  type CaseState,
  type MatchBranch,
} from '../runtime/control';
import { state } from '../runtime/state';
import { normalizeBoundaryChild } from './shared';

export type MatchProps = {
  when: unknown;
  children: unknown;
};

export type CaseProps = {
  fallback?: unknown;
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

function createCaseFallbackRenderer(fallback: unknown): (() => VNode) | null {
  const normalizedFallback = normalizeBoundaryChild(fallback);
  if (normalizedFallback == null || normalizedFallback === false) {
    return null;
  }
  return () => normalizedFallback;
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
      const key = element.key ?? index;
      const render =
        typeof props.children === 'function'
          ? () =>
              normalizeBoundaryChild((props.children as () => VNode)()) as VNode
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
