import { incDevCounter, recordBenchEvent } from '../../runtime';
import { retireComponentOwnersForIntrinsicReuse } from '../component/host-cleanup';
import { getRendererDOMHost } from '../dom-host';
import { _isDOMElement, type DOMElement, type VNode } from '../types';
import { tagNamesEqualIgnoreCase } from '../utils';

interface PreparedElement {
  dom: Element;
  vnode: DOMElement;
  children: PreparedPatch[];
}
type PreparedPatch = PreparedElement | { dom: Text; text: string };

// Eligibility traverses the complete intrinsic tree without evaluating components
// or installing properties, bindings, refs, or cleanup.
function prepare(dom: Node, vnode: VNode): PreparedPatch | null {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return dom.nodeType === 3
      ? { dom: dom as Text, text: String(vnode) }
      : null;
  }
  if (
    !(dom instanceof Element) ||
    !_isDOMElement(vnode) ||
    typeof vnode.type !== 'string' ||
    !tagNamesEqualIgnoreCase(dom.tagName, vnode.type) ||
    vnode.props?.dangerouslySetInnerHTML !== undefined
  )
    return null;
  const raw =
    (vnode.props?.children as VNode | VNode[] | undefined) ?? vnode.children;
  const next =
    raw === null || raw === undefined || raw === false
      ? []
      : Array.isArray(raw)
        ? raw
        : [raw];
  if (dom.childNodes.length !== next.length) return null;
  const children: PreparedPatch[] = [];
  for (let index = 0; index < next.length; index += 1) {
    const child = prepare(dom.childNodes[index], next[index]);
    if (!child) return null;
    children.push(child);
  }
  return { dom, vnode, children };
}

function apply(patch: PreparedPatch): void {
  if ('text' in patch) {
    if (patch.dom.data !== patch.text) {
      recordBenchEvent('domTextSet');
      patch.dom.data = patch.text;
    }
    return;
  }
  getRendererDOMHost().updateElementFromVnode(patch.dom, patch.vnode, false);
  for (const child of patch.children) apply(child);
}

export function tryPatchStableForDirtyItem(scope: {
  dom?: Node;
  vnode?: VNode;
}): boolean {
  incDevCounter('stableForPatchAttempt');
  if (!(scope.dom instanceof Element) || scope.vnode === undefined)
    return false;
  const patch = prepare(scope.dom, scope.vnode);
  if (!patch) return false;
  apply(patch);
  retireComponentOwnersForIntrinsicReuse(scope.dom, null);
  incDevCounter('stableForPatchHit');
  return true;
}
