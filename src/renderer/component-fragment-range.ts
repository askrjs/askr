import { bindComponentHost, writeHostOwners } from './dom-ownership';
import { runRetainedElementUpdate } from './retained-element-rollback';
import { teardownNodeSubtree } from './cleanup';
import {
  registerCommitParticipant,
  registerCommitRollback,
} from '../runtime/transaction-access';
import {
  mountInstanceInline,
  registerCommitEffect,
  type ComponentInstance,
} from '../runtime';
import { __CONTROL_BOUNDARY__ } from '../common/vnode';
import {
  isTransparentComponentRangeResult,
  normalizeComponentChildren,
} from './child-shape';
import {
  clearRangeOwner,
  findRangeAtNode,
  findRangeEnd,
  getOwnedRange,
  getRangeOwner,
  RANGE_END_MARKER,
  RANGE_START_MARKER,
  rangeContains,
  registerRange,
  type DOMRange,
} from './dom-range';
import { getRendererDOMHost, type InstanceHostNode } from './dom-host';
import { getControlBoundaryState } from './boundary-state';
import { registerControlBoundaryRangeCommitOwner } from './boundary-commit-owner';
import { _isDOMElement, type VNode } from './types';

export function captureRangeFocus(
  range: DOMRange,
  parent: Element
): () => void {
  const active = parent.ownerDocument.activeElement;
  if (
    typeof HTMLElement === 'undefined' ||
    !(active instanceof HTMLElement) ||
    !parent.contains(active)
  ) {
    return () => {};
  }

  let rangeChild: Node = active;
  while (rangeChild.parentNode && rangeChild.parentNode !== parent) {
    rangeChild = rangeChild.parentNode;
  }
  if (rangeChild.parentNode !== parent || !rangeContains(range, rangeChild)) {
    return () => {};
  }

  const selection =
    active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement
      ? {
          start: active.selectionStart,
          end: active.selectionEnd,
          direction: active.selectionDirection,
        }
      : null;

  return () => {
    if (!active.isConnected || active.ownerDocument.activeElement === active) {
      return;
    }

    const currentActive = active.ownerDocument.activeElement;
    if (
      currentActive instanceof Element &&
      currentActive !== active.ownerDocument.body &&
      currentActive !== active.ownerDocument.documentElement &&
      currentActive.isConnected
    ) {
      return;
    }

    try {
      active.focus({ preventScroll: true });
    } catch {
      active.focus();
    }
    if (
      selection &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement) &&
      selection.start !== null &&
      selection.end !== null
    ) {
      active.setSelectionRange(
        selection.start,
        selection.end,
        selection.direction ?? undefined
      );
    }
  };
}

function unwrapStagingHost(
  staging: Element,
  parent: Element,
  restoreFocus: () => void
): void {
  if (staging.parentNode !== parent) {
    return;
  }

  while (staging.firstChild) {
    parent.insertBefore(staging.firstChild, staging);
  }
  staging.remove();
  restoreFocus();
}

function createAttributeFreeStagingHost(parent: Element): Element {
  return parent.ownerDocument.createElementNS(
    parent.namespaceURI,
    parent.localName
  );
}

function migrateAdoptedRangeOwners(
  sourceNode: Element | Comment,
  rangeHost: InstanceHostNode,
  owners: Set<ComponentInstance>
): () => void {
  const sourceHost = sourceNode as InstanceHostNode;
  const sourceHadInstanceList = Object.prototype.hasOwnProperty.call(
    sourceHost,
    '__ASKR_INSTANCES'
  );
  const sourceHadPrimaryInstance = Object.prototype.hasOwnProperty.call(
    sourceHost,
    '__ASKR_INSTANCE'
  );
  const sourceInstanceList = sourceHost.__ASKR_INSTANCES?.slice();
  const sourcePrimaryInstance = sourceHost.__ASKR_INSTANCE;
  const previousBindings = new Map<
    ComponentInstance,
    { target: Element | null; placeholder: Comment | undefined }
  >();

  for (const owner of owners) {
    if (owner.target === sourceNode || owner._placeholder === sourceNode) {
      previousBindings.set(owner, {
        target: owner.target,
        placeholder: owner._placeholder,
      });
      bindComponentHost(owner, null, rangeHost as Comment);
    }
  }

  const sourceInstances = new Set(sourceHost.__ASKR_INSTANCES ?? []);
  if (sourcePrimaryInstance) sourceInstances.add(sourcePrimaryInstance);
  const remainingSourceInstances = Array.from(sourceInstances).filter(
    (owner) => !owners.has(owner)
  );
  if (remainingSourceInstances.length > 0) {
    writeHostOwners(
      sourceHost,
      remainingSourceInstances,
      remainingSourceInstances[0]
    );
  } else {
    writeHostOwners(sourceHost, undefined, undefined);
  }

  const rangeOwners = Array.from(owners);
  writeHostOwners(rangeHost, rangeOwners, rangeOwners[0]);

  return () => {
    writeHostOwners(
      sourceHost,
      sourceInstanceList,
      sourcePrimaryInstance,
      sourceHadInstanceList,
      sourceHadPrimaryInstance
    );
    for (const [owner, binding] of previousBindings) {
      bindComponentHost(owner, binding.target, binding.placeholder);
    }
  };
}

function isAutomaticPortalHost(node: Node): boolean {
  const host = node as InstanceHostNode;
  const instances = new Set(host.__ASKR_INSTANCES ?? []);
  if (host.__ASKR_INSTANCE) {
    instances.add(host.__ASKR_INSTANCE);
  }
  return (
    instances.size > 0 &&
    Array.from(instances).some(
      (candidate) =>
        (
          candidate.props as {
            __askrAutoDefaultPortal?: boolean;
          }
        ).__askrAutoDefaultPortal === true
    )
  );
}

function findTransparentHydrationEnd(
  start: Node,
  limit: Node | null,
  result: unknown
): Node | null | undefined {
  const expectedChildren = normalizeComponentChildren(result);
  let current: Node | null = start;

  for (const expected of expectedChildren) {
    if (!current || current === limit) {
      return undefined;
    }

    if (typeof expected === 'string' || typeof expected === 'number') {
      if (current.nodeType !== Node.TEXT_NODE) {
        return undefined;
      }
      current = current.nextSibling;
      continue;
    }

    if (!_isDOMElement(expected)) {
      return undefined;
    }

    if (typeof expected.type === 'string') {
      if (
        !(current instanceof Element) ||
        current.tagName.toLowerCase() !== expected.type.toLowerCase()
      ) {
        return undefined;
      }
      current = current.nextSibling;
      continue;
    }

    if (!isRangeStartNode(current)) {
      return undefined;
    }
    const end = findRangeEnd(current);
    if (!end) {
      return undefined;
    }
    current = end.nextSibling;
  }

  return current;
}

function isRangeStartNode(node: Node): node is Comment {
  return node instanceof Comment && node.data === RANGE_START_MARKER;
}

export function adoptHydratedComponentRange(
  existingHost: Element | Comment,
  instance: ComponentInstance,
  result: unknown,
  endExclusive: Node | null,
  forceChildrenUpdate: boolean,
  retainedInstances: Iterable<ComponentInstance>
): Comment | null {
  const parent = existingHost.parentNode;
  if (
    !(parent instanceof Element) ||
    (endExclusive !== null && endExclusive.parentNode !== parent)
  ) {
    return null;
  }

  if (endExclusive !== null) {
    let current: Node | null = existingHost;
    while (current && current !== endExclusive) {
      current = current.nextSibling;
    }
    if (current !== endExclusive) {
      return null;
    }
  }

  const matchedEnd = findTransparentHydrationEnd(
    existingHost,
    endExclusive,
    result
  );
  const resolvedEndExclusive =
    matchedEnd === undefined ? endExclusive : matchedEnd;
  const start = existingHost.ownerDocument.createComment(RANGE_START_MARKER);
  const end = existingHost.ownerDocument.createComment(RANGE_END_MARKER);
  parent.insertBefore(start, existingHost);
  parent.insertBefore(end, resolvedEndExclusive);
  registerRange({ start, end, single: false }, instance);

  const host = start as InstanceHostNode;
  const owners = new Set(retainedInstances);
  owners.add(instance);
  const restoreMigratedOwners = migrateAdoptedRangeOwners(
    existingHost,
    host,
    owners
  );
  instance.target = null;
  instance._placeholder = start;
  mountInstanceInline(instance, null);

  const registered = registerCommitEffect(
    {},
    () => {},
    () => {
      restoreMigratedOwners();
      start.parentNode?.removeChild(start);
      end.parentNode?.removeChild(end);
    }
  );

  try {
    if (
      !syncComponentFragmentRange(host, instance, result, forceChildrenUpdate)
    ) {
      throw new Error('[askr] Failed to adopt hydrated component range.');
    }
  } catch (error) {
    if (!registered) {
      restoreMigratedOwners();
      start.remove();
      end.remove();
    }
    throw error;
  }

  return start;
}

export function adoptMarkedHydratedComponentRange(
  start: Comment,
  end: Comment,
  instance: ComponentInstance,
  result: unknown,
  forceChildrenUpdate: boolean,
  retainedInstances: Iterable<ComponentInstance>
): Comment | null {
  const parent = start.parentNode;
  if (
    !(parent instanceof Element) ||
    end.parentNode !== parent ||
    start.data !== RANGE_START_MARKER ||
    end.data !== RANGE_END_MARKER ||
    findRangeEnd(start) !== end
  ) {
    return null;
  }

  const range: DOMRange = { start, end, single: false };
  const previousOwner = getRangeOwner(start);
  const previousRange = previousOwner
    ? getOwnedRange(previousOwner)
    : undefined;
  const host = start as InstanceHostNode;
  const previousInstance = host.__ASKR_INSTANCE;
  const previousInstances = host.__ASKR_INSTANCES;

  registerRange(range, instance);
  const owners = new Set(retainedInstances);
  owners.add(instance);
  writeHostOwners(host, Array.from(owners), instance);
  instance.target = null;
  instance._placeholder = start;
  mountInstanceInline(instance, null);

  const rollback = (): void => {
    clearRangeOwner(range, instance);
    if (previousOwner && previousRange) {
      registerRange(previousRange, previousOwner);
    }
    writeHostOwners(host, previousInstances, previousInstance, true, true);
  };
  const registered = registerCommitEffect({}, () => {}, rollback);

  try {
    if (
      !syncComponentFragmentRange(host, instance, result, forceChildrenUpdate)
    ) {
      throw new Error(
        '[askr] Failed to adopt marked hydrated component range.'
      );
    }
  } catch (error) {
    if (!registered) rollback();
    throw error;
  }

  return start;
}

export function syncComponentFragmentRange(
  host: InstanceHostNode,
  instance: ComponentInstance,
  result: unknown,
  forceUpdate: boolean
): boolean {
  const hostInstances = new Set(host.__ASKR_INSTANCES ?? []);
  if (host.__ASKR_INSTANCE) {
    hostInstances.add(host.__ASKR_INSTANCE);
  }
  const range =
    getOwnedRange(instance) ??
    (instance._placeholder === host && hostInstances.has(instance)
      ? (findRangeAtNode(host) ?? undefined)
      : undefined);
  if (!range || range.single || range.start !== host) {
    return false;
  }

  return syncTransparentRange(range, result, forceUpdate);
}

export function syncTransparentRange(
  range: DOMRange,
  result: unknown,
  forceUpdate: boolean
): boolean {
  const emptyResult =
    result === null || result === undefined || result === false;
  const controlBoundaryResult =
    _isDOMElement(result) && result.type === __CONTROL_BOUNDARY__;
  if (
    (!emptyResult &&
      !controlBoundaryResult &&
      !isTransparentComponentRangeResult(result)) ||
    range.single
  ) {
    return false;
  }

  const parent = range.start.parentNode;
  if (!(parent instanceof Element) || range.end.parentNode !== parent) {
    return false;
  }

  const restoreFocus = captureRangeFocus(range, parent);
  const normalizedChildren = normalizeComponentChildren(result) as VNode[];
  const preserveForeignHosts = Array.isArray(result);
  const staging = createAttributeFreeStagingHost(parent);
  try {
    parent.insertBefore(staging, range.end);
  } catch {
    staging.remove();
    return false;
  }
  if (staging.parentNode !== parent || staging.nextSibling !== range.end) {
    staging.remove();
    restoreFocus();
    return false;
  }
  let current = range.start.nextSibling;
  while (current && current !== staging) {
    const next = current.nextSibling;
    if (!preserveForeignHosts || !isAutomaticPortalHost(current)) {
      staging.appendChild(current);
    }
    current = next;
  }

  const previousNodes = Array.from(staging.childNodes);
  const rollbackStaging = registerCommitRollback(() => {
    const retained = new Set(previousNodes);
    let current = range.start.nextSibling;
    const errors: unknown[] = [];
    while (current && current !== range.end) {
      const next = current.nextSibling;
      if (
        current !== staging &&
        !retained.has(current) &&
        (!preserveForeignHosts || !isAutomaticPortalHost(current))
      ) {
        try {
          teardownNodeSubtree(current);
        } catch (error) {
          errors.push(error);
        }
        current.parentNode?.removeChild(current);
      }
      current = next;
    }
    for (const node of previousNodes) parent.insertBefore(node, range.end);
    staging.remove();
    restoreFocus();
    if (errors.length)
      throw new AggregateError(errors, 'Fragment restoration failed');
  });

  try {
    runRetainedElementUpdate(staging, teardownNodeSubtree, () =>
      getRendererDOMHost().updateElementChildren(
        staging,
        normalizedChildren,
        forceUpdate
      )
    );
  } catch (error) {
    if (!rollbackStaging) {
      unwrapStagingHost(staging, parent, restoreFocus);
    }
    throw error;
  }

  if (
    !registerCommitParticipant({
      apply: () => unwrapStagingHost(staging, parent, restoreFocus),
    })
  ) {
    unwrapStagingHost(staging, parent, restoreFocus);
  }
  if (controlBoundaryResult) {
    const controlState = getControlBoundaryState(result);
    if (controlState) {
      registerControlBoundaryRangeCommitOwner(range, controlState, () => {
        syncTransparentRange(range, result, false);
      });
    }
  }
  return true;
}
