import {
  registerLifecycleTransaction,
  type ComponentInstance,
} from '../runtime';
import {
  isTransparentComponentRangeResult,
  normalizeComponentChildren,
} from './child-shape';
import { getOwnedRange, rangeContains, type DOMRange } from './dom-range';
import { getRendererDOMHost, type InstanceHostNode } from './dom-host';
import type { VNode } from './types';

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

export function syncComponentFragmentRange(
  host: InstanceHostNode,
  instance: ComponentInstance,
  result: unknown,
  forceUpdate: boolean
): boolean {
  if (!isTransparentComponentRangeResult(result)) {
    return false;
  }

  const range = getOwnedRange(instance);
  const parent = range?.start.parentNode;
  if (
    !range ||
    range.single ||
    range.start !== host ||
    !(parent instanceof Element)
  ) {
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

  const rollbackStaging = registerLifecycleTransaction(
    {},
    () => {},
    () => unwrapStagingHost(staging, parent, restoreFocus)
  );

  try {
    getRendererDOMHost().updateElementChildren(
      staging,
      normalizedChildren,
      forceUpdate
    );
  } catch (error) {
    if (!rollbackStaging) {
      unwrapStagingHost(staging, parent, restoreFocus);
    }
    throw error;
  }

  if (
    !registerLifecycleTransaction(
      {},
      () => unwrapStagingHost(staging, parent, restoreFocus),
      () => {}
    )
  ) {
    unwrapStagingHost(staging, parent, restoreFocus);
  }
  return true;
}
