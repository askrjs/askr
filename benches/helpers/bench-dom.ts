/**
 * Benchmark DOM utilities
 *
 * Provides utilities for DOM manipulation and measurement in benchmarks.
 */

export interface DOMMetrics {
  nodesCreated: number;
  nodesRemoved: number;
  attributesSet: number;
  textChanges: number;
}

/**
 * Track DOM operations during benchmark execution
 */
export function trackDOMOperations(node: Node, fn: () => void): DOMMetrics {
  let nodesCreated = 0;
  let nodesRemoved = 0;
  let attributesSet = 0;
  let textChanges = 0;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        nodesCreated += mutation.addedNodes.length;
        nodesRemoved += mutation.removedNodes.length;
      } else if (mutation.type === 'attributes') {
        attributesSet++;
      } else if (mutation.type === 'characterData') {
        textChanges++;
      }
    }
  });

  // Observe the provided container node so benches can be reliably isolated
  observer.observe(node, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
  });

  try {
    fn();
  } finally {
    // capture any pending mutation records synchronously and then disconnect
    observer.takeRecords();
    observer.disconnect();
  }

  return {
    nodesCreated,
    nodesRemoved,
    attributesSet,
    textChanges,
  };
}

/**
 * Create DOM element tree for benchmarking
 */
export function createDOMTree(depth: number, breadth: number): Element {
  const element = document.createElement('div');

  if (depth === 0) {
    element.textContent = `leaf-${Math.random()}`;
    return element;
  }

  for (let i = 0; i < breadth; i++) {
    element.appendChild(createDOMTree(depth - 1, breadth));
  }

  return element;
}

/**
 * Clean up DOM elements
 */
export function cleanupDOM(element: Element): void {
  if (element.parentNode) {
    element.parentNode.removeChild(element);
  }
}
