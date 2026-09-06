import type { ComponentFunction } from '../../runtime';
import {
  buildBlueprint,
  cacheBlueprint,
  getBlueprint,
} from './blueprint-analysis';
import { instantiateBlueprint } from './blueprint-materialization';
import type { ReactiveChildDOMHost } from '../children/reactive-children';
import { _isDOMElement, type VNode } from '../types';

/**
 * Stable renderer facade for the intrinsic blueprint fast path.
 *
 * Analysis, materialization, and grouped binding publication intentionally
 * live behind this small adapter so callers do not depend on their internal
 * representations.
 */
export function createResultNodeWithBlueprint(
  owner: object,
  result: unknown,
  parentNamespace: string | undefined,
  createNormally: () => Node | null,
  host: ReactiveChildDOMHost
): Node | null {
  if (!_isDOMElement(result) || typeof result.type !== 'string') {
    return createNormally();
  }

  const cached = getBlueprint(owner, document, parentNamespace);
  if (cached) {
    const instantiated = instantiateBlueprint(cached, result, host);
    if (instantiated) return instantiated;
  }

  const node = createNormally();
  if (!(node instanceof Element) || cached) return node;

  const blueprint = buildBlueprint(node, result);
  if (blueprint) {
    cacheBlueprint(owner, node.ownerDocument, parentNamespace, blueprint);
  }
  return node;
}

export function createComponentResultNodeWithBlueprint(
  component: ComponentFunction,
  result: unknown,
  parentNamespace: string | undefined,
  createNormally: () => Node | null,
  host: ReactiveChildDOMHost
): Node | null {
  return createResultNodeWithBlueprint(
    component,
    result as VNode,
    parentNamespace,
    createNormally,
    host
  );
}
