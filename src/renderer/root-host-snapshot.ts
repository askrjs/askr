import { teardownNodeSubtree } from './cleanup';
type RootNodeSnapshot = {
  node: Node;
  children: Node[];
  attributes: Array<[string, string]> | null;
  nodeValue: string | null;
};

type RootHostTreeSnapshot = {
  root: Element;
  nodes: RootNodeSnapshot[];
};

function captureRootTree(root: Element | null): RootHostTreeSnapshot | null {
  if (!root) {
    return null;
  }

  const nodes: RootNodeSnapshot[] = [];
  const visit = (node: Node): void => {
    nodes.push({
      node,
      children: Array.from(node.childNodes),
      attributes:
        node instanceof Element
          ? Array.from(node.attributes).map((attribute) => [
              attribute.name,
              attribute.value,
            ])
          : null,
      nodeValue: node.nodeValue,
    });

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };

  visit(root);
  return { root, nodes };
}

function collectProvisionalRootNodes(snapshot: RootHostTreeSnapshot): Node[] {
  const originalNodes = new Set(snapshot.nodes.map((entry) => entry.node));
  const provisional: Node[] = [];
  const visit = (node: Node): void => {
    if (!originalNodes.has(node)) {
      provisional.push(node);
      return;
    }

    for (const child of Array.from(node.childNodes)) {
      visit(child);
    }
  };

  for (const child of Array.from(snapshot.root.childNodes)) {
    visit(child);
  }

  return provisional;
}

function restoreRootTree(snapshot: RootHostTreeSnapshot | null): unknown[] {
  if (!snapshot) {
    return [];
  }

  const errors: unknown[] = [];
  for (const node of collectProvisionalRootNodes(snapshot)) {
    try {
      teardownNodeSubtree(node, { strict: true });
    } catch (error) {
      errors.push(error);
    }
  }

  for (const entry of snapshot.nodes) {
    const { node, attributes } = entry;
    try {
      if (attributes && node instanceof Element) {
        const expected = new Map(attributes);
        for (const attribute of Array.from(node.attributes)) {
          if (!expected.has(attribute.name)) {
            node.removeAttribute(attribute.name);
          }
        }
        for (const [name, value] of attributes) {
          if (node.getAttribute(name) !== value) {
            node.setAttribute(name, value);
          }
        }
      } else if (!(node instanceof Element)) {
        node.nodeValue = entry.nodeValue;
      }

      if (node instanceof Element || node instanceof DocumentFragment) {
        node.replaceChildren(...entry.children);
      }
    } catch (error) {
      errors.push(error);
    }
  }

  return errors;
}

export interface RootHostSnapshot {
  restore(): unknown[];
}

export function captureRootHost(root: Element | null): RootHostSnapshot {
  const snapshot = captureRootTree(root);
  return { restore: () => restoreRootTree(snapshot) };
}
