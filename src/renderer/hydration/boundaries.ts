import type { DOMRange } from '../../common/dom-range';
import type { ComponentInstance } from '../../runtime';
import type { VNode } from '../types';

export type DeferredHydrationBoundaryState =
  | 'deferred'
  | 'activating'
  | 'active'
  | 'failed';

export interface DeferredHydrationBoundaryRecord {
  readonly root: Element;
  readonly element: Element;
  readonly owner: {
    owner: ComponentInstance | null;
    parent: ComponentInstance | null;
    portalScope: object | null;
  };
  context: object | null;
  readonly range: DOMRange | undefined;
  vnode: VNode | undefined;
  renderResult: unknown;
  state: DeferredHydrationBoundaryState;
  attempts: number;
}

const recordsByElement = new WeakMap<
  Element,
  DeferredHydrationBoundaryRecord
>();
const recordsByRoot = new WeakMap<
  Element,
  Set<DeferredHydrationBoundaryRecord>
>();

export function registerDeferredHydrationBoundary(
  root: Element,
  element: Element,
  range?: DOMRange
): DeferredHydrationBoundaryRecord {
  const existing = recordsByElement.get(element);
  if (existing) {
    return existing;
  }

  const record: DeferredHydrationBoundaryRecord = {
    root,
    element,
    owner: {
      owner: null,
      parent: null,
      portalScope: null,
    },
    context: null,
    range,
    vnode: undefined,
    renderResult: undefined,
    state: 'deferred',
    attempts: 0,
  };
  recordsByElement.set(element, record);
  const rootRecords = recordsByRoot.get(root) ?? new Set();
  rootRecords.add(record);
  recordsByRoot.set(root, rootRecords);
  return record;
}

export function rememberDeferredHydrationVNode(
  element: Element,
  vnode: VNode,
  owner: ComponentInstance | null,
  context: object | null
): DeferredHydrationBoundaryRecord | undefined {
  const record = recordsByElement.get(element);
  if (!record) {
    return undefined;
  }

  record.vnode = vnode;
  record.renderResult = vnode;
  record.owner.owner = owner;
  record.owner.parent = owner?.parentInstance ?? null;
  record.owner.portalScope = owner?.portalScope ?? null;
  record.context = context;
  return record;
}

export function getDeferredHydrationBoundary(
  element: Element
): DeferredHydrationBoundaryRecord | undefined {
  return recordsByElement.get(element);
}

export function beginDeferredHydrationActivation(
  element: Element
): DeferredHydrationBoundaryRecord | undefined {
  const record = recordsByElement.get(element);
  if (
    !record ||
    !record.vnode ||
    record.state === 'active' ||
    record.state === 'activating'
  ) {
    return undefined;
  }

  record.attempts += 1;
  record.state = 'activating';
  return record;
}

export function commitDeferredHydrationActivation(
  record: DeferredHydrationBoundaryRecord
): void {
  record.state = 'active';
}

export function rollbackDeferredHydrationActivation(
  record: DeferredHydrationBoundaryRecord
): void {
  record.state = 'failed';
}

export function clearDeferredHydrationBoundaries(root: Element): void {
  const records = recordsByRoot.get(root);
  if (!records) {
    return;
  }

  for (const record of records) {
    recordsByElement.delete(record.element);
  }
  records.clear();
  recordsByRoot.delete(root);
}
