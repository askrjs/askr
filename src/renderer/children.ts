import { setDevValue, incDevCounter } from "../runtime";
import { getRuntimeEnv } from "./env";
import { keyedElements } from "./keyed";
import { teardownNodeSubtree } from "./cleanup";
import { createDOMNode, updateElementFromVnode } from "./dom";
import { tagsEqualIgnoreCase } from "./children-fastpath";
import type { DOMElement, VNode } from "./types";
import { now, recordDOMReplace } from "./utils";

declare const __ASKR_DEVELOPMENT_BUILD__: boolean;

const DEVELOPMENT_BUILD_ENABLED = __ASKR_DEVELOPMENT_BUILD__;

export { performBulkPositionalKeyedTextUpdate } from "./children-fastpath";

export function performBulkTextReplace(parent: Element, newChildren: VNode[]) {
  const start = now();
  const existing = Array.from(parent.childNodes);
  const finalNodes: Node[] = [];
  let reused = 0;
  let created = 0;

  for (let index = 0; index < newChildren.length; index += 1) {
    const result = processChildNode(newChildren[index], existing[index], finalNodes);
    if (result === "reused") reused += 1;
    else if (result === "created") created += 1;
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
  finalNodes: Node[],
): "reused" | "created" | "skipped" {
  if (typeof vnode === "string" || typeof vnode === "number") {
    return processTextVnode(String(vnode), existingNode, finalNodes);
  }

  if (typeof vnode === "object" && vnode !== null && "type" in vnode) {
    return processElementVnode(vnode, existingNode, finalNodes);
  }

  return "skipped";
}

function processTextVnode(
  text: string,
  existingNode: ChildNode | undefined,
  finalNodes: Node[],
): "reused" | "created" {
  if (existingNode && existingNode.nodeType === 3) {
    (existingNode as Text).data = text;
    finalNodes.push(existingNode);
    return "reused";
  }

  finalNodes.push(document.createTextNode(text));
  return "created";
}

function processElementVnode(
  vnode: VNode,
  existingNode: ChildNode | undefined,
  finalNodes: Node[],
): "reused" | "created" | "skipped" {
  const vnodeObj = vnode as unknown as { type?: unknown };

  if (typeof vnodeObj.type === "string") {
    const tag = vnodeObj.type;
    if (
      existingNode &&
      existingNode.nodeType === 1 &&
      tagsEqualIgnoreCase((existingNode as Element).tagName, tag)
    ) {
      updateElementFromVnode(existingNode as Element, vnode);
      finalNodes.push(existingNode);
      return "reused";
    }
  }

  const dom = createDOMNode(vnode);
  if (dom) {
    finalNodes.push(dom);
    return "created";
  }

  return "skipped";
}

function commitBulkReplace(parent: Element, nodes: Node[]): number {
  const startedAt = Date.now();
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < nodes.length; index += 1) {
    fragment.appendChild(nodes[index]);
  }

  try {
    for (let node = parent.firstChild; node;) {
      const next = node.nextSibling;
      teardownNodeSubtree(node);
      node = next;
    }
  } catch {
    // SLOW PATH: cleanup failure
  }

  recordDOMReplace("bulk-text-replace");
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
    setDevValue("__LAST_BULK_TEXT_FASTPATH_STATS", stats);
    setDevValue("__LAST_FASTPATH_STATS", stats);
    setDevValue("__LAST_FASTPATH_COMMIT_COUNT", 1);
    incDevCounter("bulkTextFastpathHits");
  } catch {
    // Ignore stats errors
  }
}

export function isBulkTextFastPathEligible(parent: Element, newChildren: VNode[]) {
  const env = getRuntimeEnv();
  const threshold = Number(env.ASKR_BULK_TEXT_THRESHOLD) || 1024;
  const requiredFraction = 0.8;

  const total = Array.isArray(newChildren) ? newChildren.length : 0;

  if (total < threshold) {
    recordBulkDiag({
      phase: "bulk-unkeyed-eligible",
      reason: "too-small",
      total,
      threshold,
    });
    return false;
  }

  const result = countSimpleChildren(newChildren);
  if (result.componentFound !== undefined) {
    recordBulkDiag({
      phase: "bulk-unkeyed-eligible",
      reason: "component-child",
      index: result.componentFound,
    });
    return false;
  }

  const fraction = result.simple / total;
  const eligible = fraction >= requiredFraction && parent.childNodes.length >= total;

  recordBulkDiag({
    phase: "bulk-unkeyed-eligible",
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

    if (typeof child === "string" || typeof child === "number") {
      simple += 1;
      continue;
    }

    if (typeof child === "object" && child !== null && "type" in child) {
      const dom = child as DOMElement;

      if (typeof dom.type === "function") {
        return { simple, componentFound: index };
      }

      if (typeof dom.type === "string" && isSimpleElement(dom)) {
        simple += 1;
      }
    }
  }

  return { simple };
}

function isSimpleElement(dom: DOMElement): boolean {
  const children = dom.props?.children ?? dom.children;

  if (children === null || children === undefined) return true;

  if (typeof children === "string" || typeof children === "number") {
    return true;
  }

  if (
    Array.isArray(children) &&
    children.length === 1 &&
    (typeof children[0] === "string" || typeof children[0] === "number")
  ) {
    return true;
  }

  return false;
}

function recordBulkDiag(data: Record<string, unknown>): void {
  if (!DEVELOPMENT_BUILD_ENABLED) {
    return;
  }
  const env = getRuntimeEnv();
  if (env.NODE_ENV !== "production" || env.ASKR_FASTPATH_DEBUG === "1") {
    try {
      setDevValue("__BULK_DIAG", data);
    } catch {
      // Ignore
    }
  }
}
