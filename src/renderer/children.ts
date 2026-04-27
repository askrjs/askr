import { setDevValue, incDevCounter } from '../runtime/dev-namespace';
import { getRuntimeEnv } from './env';
import { keyedElements } from './keyed';
import { teardownNodeSubtree } from './cleanup';
import { createDOMNode, updateElementFromVnode } from './dom';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import {
  hasNonTrivialProps,
  logFastPathDebug,
  now,
  recordDOMReplace,
  recordFastPathStats,
  tagNamesEqualIgnoreCase,
} from './utils';

function upperCommonTagName(tag: string): string | null {
  switch (tag) {
    case 'div':
      return 'DIV';
    case 'span':
      return 'SPAN';
    case 'p':
      return 'P';
    case 'a':
      return 'A';
    case 'button':
      return 'BUTTON';
    case 'input':
      return 'INPUT';
    case 'ul':
      return 'UL';
    case 'ol':
      return 'OL';
    case 'li':
      return 'LI';
    default:
      return null;
  }
}

function tagsEqualIgnoreCase(
  elementTagName: string,
  vnodeType: string
): boolean {
  if (elementTagName === vnodeType) return true;

  const upperCommon = upperCommonTagName(vnodeType);
  if (upperCommon !== null && elementTagName === upperCommon) return true;

  return tagNamesEqualIgnoreCase(elementTagName, vnodeType);
}

export function performBulkPositionalKeyedTextUpdate(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
) {
  const total = keyedVnodes.length;
  let reused = 0;
  let updatedKeys = 0;
  const start = now();
  const env = getRuntimeEnv();
  const debugFastPath =
    env.ASKR_FASTPATH_DEBUG === '1' || env.ASKR_FASTPATH_DEBUG === 'true';

  for (let index = 0; index < total; index += 1) {
    const { key, vnode } = keyedVnodes[index];
    const child = parent.children[index] as Element | undefined;

    if (
      child &&
      _isDOMElement(vnode) &&
      typeof (vnode as DOMElement).type === 'string'
    ) {
      const vnodeType = (vnode as DOMElement).type as string;

      if (tagsEqualIgnoreCase(child.tagName, vnodeType)) {
        const children =
          (vnode as DOMElement).children ||
          (vnode as DOMElement).props?.children;

        if (debugFastPath) {
          logFastPathDebug('positional idx', index, {
            chTag: child.tagName,
            vnodeType,
            chChildNodes: child.childNodes.length,
            childrenType: Array.isArray(children) ? 'array' : typeof children,
          });
        }

        updateTextContent(child, children, vnode as DOMElement);
        setDataKey(child, key, () => (updatedKeys += 1));
        reused += 1;
        continue;
      }

      if (debugFastPath) {
        logFastPathDebug('positional tag mismatch', index, {
          chTag: child.tagName,
          vnodeType,
        });
      }
    } else if (debugFastPath) {
      logFastPathDebug('positional missing or invalid', index, { ch: !!child });
    }

    replaceNodeAtPosition(parent, index, vnode);
  }

  const elapsed = now() - start;
  updateKeyedElementsMap(parent, keyedVnodes);

  const stats = { n: total, reused, updatedKeys, t: elapsed } as const;
  recordFastPathStats(stats, 'bulkKeyedPositionalHits');

  return stats;
}

function updateTextContent(
  el: Element,
  children: unknown,
  vnode: DOMElement
): void {
  if (typeof children === 'string' || typeof children === 'number') {
    setTextNodeData(el, String(children));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
    return;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    setTextNodeData(el, String(children[0]));
    if (vnode.props && hasNonTrivialProps(vnode.props)) {
      updateElementFromVnode(el, vnode, false);
    }
    return;
  }

  if (!tryUpdateTwoChildTextPattern(el, vnode)) {
    updateElementFromVnode(el, vnode);
  }
}

function tryUpdateTwoChildTextPattern(
  parentEl: Element,
  vnode: DOMElement
): boolean {
  const vnodeChildren = vnode.children || vnode.props?.children;
  if (!Array.isArray(vnodeChildren) || vnodeChildren.length !== 2) return false;

  const firstChild = vnodeChildren[0];
  const secondChild = vnodeChildren[1];
  if (!_isDOMElement(firstChild) || !_isDOMElement(secondChild)) return false;
  if (
    typeof firstChild.type !== 'string' ||
    typeof secondChild.type !== 'string'
  ) {
    return false;
  }

  const firstElement = parentEl.children[0] as Element | undefined;
  const secondElement = parentEl.children[1] as Element | undefined;
  if (!firstElement || !secondElement) return false;

  if (!tagsEqualIgnoreCase(firstElement.tagName, firstChild.type)) return false;
  if (!tagsEqualIgnoreCase(secondElement.tagName, secondChild.type))
    return false;

  const firstText = (firstChild.children ||
    firstChild.props?.children) as unknown;
  const secondText = (secondChild.children ||
    secondChild.props?.children) as unknown;

  if (typeof firstText === 'string' || typeof firstText === 'number') {
    setTextNodeData(firstElement, String(firstText));
  } else if (
    Array.isArray(firstText) &&
    firstText.length === 1 &&
    (typeof firstText[0] === 'string' || typeof firstText[0] === 'number')
  ) {
    setTextNodeData(firstElement, String(firstText[0]));
  } else {
    return false;
  }

  if (typeof secondText === 'string' || typeof secondText === 'number') {
    setTextNodeData(secondElement, String(secondText));
  } else if (
    Array.isArray(secondText) &&
    secondText.length === 1 &&
    (typeof secondText[0] === 'string' || typeof secondText[0] === 'number')
  ) {
    setTextNodeData(secondElement, String(secondText[0]));
  } else {
    return false;
  }

  return true;
}

function setTextNodeData(el: Element, text: string): void {
  if (el.childNodes.length === 1 && el.firstChild?.nodeType === 3) {
    const textNode = el.firstChild as Text;
    if (textNode.data !== text) textNode.data = text;
  } else {
    el.textContent = text;
  }
}

function setDataKey(
  el: Element,
  key: string | number,
  onSet: () => void
): void {
  try {
    const next = String(key);
    if (el.getAttribute('data-key') === next) return;
    el.setAttribute('data-key', next);
    onSet();
  } catch {
    // Ignore errors setting data-key
  }
}

function replaceNodeAtPosition(
  parent: Element,
  index: number,
  vnode: VNode
): void {
  const dom = createDOMNode(vnode);
  if (dom) {
    const existing = parent.children[index];
    if (existing) {
      teardownNodeSubtree(existing);
      parent.replaceChild(dom, existing);
    } else {
      parent.appendChild(dom);
    }
  }
}

function updateKeyedElementsMap(
  parent: Element,
  keyedVnodes: Array<{ key: string | number; vnode: VNode }>
): void {
  try {
    const existing = keyedElements.get(parent);
    const newKeyMap = existing
      ? (existing.clear(), existing)
      : new Map<string | number, Element>();

    for (let index = 0; index < keyedVnodes.length; index += 1) {
      const key = keyedVnodes[index].key;
      const child = parent.children[index] as Element | undefined;
      if (child) newKeyMap.set(key, child);
    }

    keyedElements.set(parent, newKeyMap);
  } catch {
    // Ignore errors updating key map
  }
}

export function performBulkTextReplace(parent: Element, newChildren: VNode[]) {
  const start = now();
  const existing = Array.from(parent.childNodes);
  const finalNodes: Node[] = [];
  let reused = 0;
  let created = 0;

  for (let index = 0; index < newChildren.length; index += 1) {
    const result = processChildNode(
      newChildren[index],
      existing[index],
      finalNodes
    );
    if (result === 'reused') reused += 1;
    else if (result === 'created') created += 1;
  }

  const tBuild = now() - start;
  const tCommit = commitBulkReplace(parent, finalNodes);

  keyedElements.delete(parent);

  const stats = {
    n: newChildren.length,
    reused,
    created,
    tBuild,
    tCommit,
  } as const;
  recordBulkTextStats(stats);

  return stats;
}

function processChildNode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  if (typeof vnode === 'string' || typeof vnode === 'number') {
    return processTextVnode(String(vnode), existingNode, finalNodes);
  }

  if (typeof vnode === 'object' && vnode !== null && 'type' in vnode) {
    return processElementVnode(vnode, existingNode, finalNodes);
  }

  return 'skipped';
}

function processTextVnode(
  text: string,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' {
  if (existingNode && existingNode.nodeType === 3) {
    (existingNode as Text).data = text;
    finalNodes.push(existingNode);
    return 'reused';
  }

  finalNodes.push(document.createTextNode(text));
  return 'created';
}

function processElementVnode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[]
): 'reused' | 'created' | 'skipped' {
  const vnodeObj = vnode as unknown as { type?: unknown };

  if (typeof vnodeObj.type === 'string') {
    const tag = vnodeObj.type;
    if (
      existingNode &&
      existingNode.nodeType === 1 &&
      tagsEqualIgnoreCase((existingNode as Element).tagName, tag)
    ) {
      updateElementFromVnode(existingNode as Element, vnode);
      finalNodes.push(existingNode);
      return 'reused';
    }
  }

  const dom = createDOMNode(vnode);
  if (dom) {
    finalNodes.push(dom);
    return 'created';
  }

  return 'skipped';
}

function commitBulkReplace(parent: Element, nodes: Node[]): number {
  const startedAt = Date.now();
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < nodes.length; index += 1) {
    fragment.appendChild(nodes[index]);
  }

  try {
    for (let node = parent.firstChild; node; ) {
      const next = node.nextSibling;
      teardownNodeSubtree(node);
      node = next;
    }
  } catch {
    // SLOW PATH: cleanup failure
  }

  recordDOMReplace('bulk-text-replace');
  parent.replaceChildren(fragment);
  return Date.now() - startedAt;
}

function recordBulkTextStats(stats: {
  n: number;
  reused: number;
  created: number;
  tBuild: number;
  tCommit: number;
}): void {
  try {
    setDevValue('__LAST_BULK_TEXT_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_STATS', stats);
    setDevValue('__LAST_FASTPATH_COMMIT_COUNT', 1);
    incDevCounter('bulkTextFastpathHits');
  } catch {
    // Ignore stats errors
  }
}

export function isBulkTextFastPathEligible(
  parent: Element,
  newChildren: VNode[]
) {
  const env = getRuntimeEnv();
  const threshold = Number(env.ASKR_BULK_TEXT_THRESHOLD) || 1024;
  const requiredFraction = 0.8;

  const total = Array.isArray(newChildren) ? newChildren.length : 0;

  if (total < threshold) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'too-small',
      total,
      threshold,
    });
    return false;
  }

  const result = countSimpleChildren(newChildren);
  if (result.componentFound !== undefined) {
    recordBulkDiag({
      phase: 'bulk-unkeyed-eligible',
      reason: 'component-child',
      index: result.componentFound,
    });
    return false;
  }

  const fraction = result.simple / total;
  const eligible =
    fraction >= requiredFraction && parent.childNodes.length >= total;

  recordBulkDiag({
    phase: 'bulk-unkeyed-eligible',
    total,
    simple: result.simple,
    fraction,
    requiredFraction,
    eligible,
  });

  return eligible;
}

function countSimpleChildren(children: VNode[]): {
  simple: number;
  componentFound?: number;
} {
  let simple = 0;

  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];

    if (typeof child === 'string' || typeof child === 'number') {
      simple += 1;
      continue;
    }

    if (typeof child === 'object' && child !== null && 'type' in child) {
      const dom = child as DOMElement;

      if (typeof dom.type === 'function') {
        return { simple, componentFound: index };
      }

      if (typeof dom.type === 'string' && isSimpleElement(dom)) {
        simple += 1;
      }
    }
  }

  return { simple };
}

function isSimpleElement(dom: DOMElement): boolean {
  const children = dom.children || dom.props?.children;

  if (children === null || children === undefined) return true;

  if (typeof children === 'string' || typeof children === 'number') {
    return true;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === 'string' || typeof children[0] === 'number')
  ) {
    return true;
  }

  return false;
}

function recordBulkDiag(data: Record<string, unknown>): void {
  const env = getRuntimeEnv();
  if (env.NODE_ENV !== 'production' || env.ASKR_FASTPATH_DEBUG === '1') {
    try {
      setDevValue('__BULK_DIAG', data);
    } catch {
      // Ignore
    }
  }
}
