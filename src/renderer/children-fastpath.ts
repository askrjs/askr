import { getRuntimeEnv } from './env';
import { keyedElements } from './keyed';
import { teardownNodeSubtree } from './cleanup';
import { createDOMNode, updateElementFromVnode } from './dom';
import { _isDOMElement, type DOMElement, type VNode } from './types';
import {
  hasNonTrivialProps,
  logFastPathDebug,
  now,
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

export function tagsEqualIgnoreCase(
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
  const vnodeChildren = vnode.props?.children ?? vnode.children;
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
  if (parentEl.children.length !== 2 || parentEl.childNodes.length !== 2) {
    return false;
  }

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
    const keyKind = typeof key;
    if (
      el.getAttribute('data-key') === next &&
      el.getAttribute('data-askr-key-kind') === keyKind
    )
      return;
    el.setAttribute('data-key', next);
    el.setAttribute('data-askr-key-kind', keyKind);
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
