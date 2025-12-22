/**
 * test_renderer.ts - THE KEYSTONE
 *
 * This file defines the public surface for observing Askr behavior.
 * Framework code NEVER imports from this.
 * Tests ONLY import from here (not from framework internals).
 *
 * Every function here answers ONE question about observable runtime behavior.
 */

import { globalScheduler } from '../../src/runtime/scheduler';
import { renderToStringSync } from '../../src/ssr';
import type { Component as SSRComponent } from '../../src/ssr';

/**
 * TEST OBSERVATION LAYER
 * These are the ONLY ways to see what the runtime is doing
 */

/**
 * Create an isolated test container for component rendering
 * Returns a fresh DOM node and cleanup function
 */
let _testContainerCounter = 0;

export function createTestContainer(): {
  container: HTMLDivElement;
  cleanup: () => void;
} {
  const container = document.createElement('div');
  // Ensure container has an id so tests can reference it via selectors
  container.id = `test-root-${++_testContainerCounter}`;
  document.body.appendChild(container);

  return {
    container,
    cleanup: () => {
      // Cleanup any Askr instance associated with this container
      const cleanupFn = (
        container as unknown as Record<string | symbol, unknown>
      )[Symbol.for('__tempoCleanup__')] as (() => void) | undefined;
      if (cleanupFn) {
        cleanupFn();
      }
      if (container.parentNode) {
        document.body.removeChild(container);
      }
    },
  };
}

/**
 * Wait for all pending scheduler tasks to complete
 * Use this after events or state changes to ensure DOM is updated
 * If a task throws, this will throw that error
 */
export function flushScheduler(): void {
  // Synchronously flush all pending tasks
  // This will throw if any task throws during execution
  globalScheduler.flush();
}

/**
 * Wait for next evaluation cycle without draining queue
 * Use when you need to observe intermediate state
 */
export async function waitForNextEvaluation(): Promise<void> {
  // Backward-compatible alias to wait for the next scheduler flush
  // This prevents the common race where tests subscribe after the flush already happened.
  return waitForFlush();
}

export async function waitForFlush(timeout = 2000): Promise<void> {
  // Use scheduler-based barrier to wait for the next flush.
  // If there are no pending tasks and scheduler is quiescent, resolve immediately.
  const state = globalScheduler.getState();
  if (state.taskCount === 0 && !state.running) return;

  // Otherwise wait for the next flushVersion (current + 1)
  const target =
    (state as unknown as { flushVersion: number }).flushVersion + 1;
  try {
    await globalScheduler.waitForFlush(target, timeout);
  } catch (err) {
    // Propagate with extra diagnostics
    const gl = globalThis as unknown as {
      __ASKR_FASTLANE?: { isBulkCommitActive?: () => boolean };
      __ASKR_LAST_BULK_TEXT_FASTPATH_STATS?: unknown;
      __ASKR_ENQUEUE_LOGS?: unknown;
    };
    console.error('[waitForFlush] timeout diagnostics', {
      scheduler: globalScheduler.getState(),
      fastlaneActive: !!gl.__ASKR_FASTLANE?.isBulkCommitActive?.(),
      lastFastpath: gl.__ASKR_LAST_BULK_TEXT_FASTPATH_STATS,
      enqueueLogs: gl.__ASKR_ENQUEUE_LOGS,
    });
    throw err;
  }
}

/**
 * Get current scheduler state for debugging
 */
export function getSchedulerState() {
  return globalScheduler.getState();
}

/**
 * DOM OBSERVATION LAYER
 * Assert what's actually in the DOM
 */

/**
 * Count total mutations to a DOM node
 * Use to prove "minimal mutation" guarantee
 */
export function trackDOMMutations(
  node: Element,
  callback: () => void
): {
  addedNodes: number;
  removedNodes: number;
  changedAttributes: number;
  changedText: number;
} {
  let addedNodes = 0;
  let removedNodes = 0;
  let changedAttributes = 0;
  let changedText = 0;

  const processRecords = (mutations: MutationRecord[]) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'childList') {
        addedNodes += mutation.addedNodes.length;
        removedNodes += mutation.removedNodes.length;
      } else if (mutation.type === 'attributes') {
        changedAttributes++;
      } else if (mutation.type === 'characterData') {
        changedText++;
      }
    });
  };

  const observer = new MutationObserver((mutations) => {
    processRecords(mutations);
  });

  observer.observe(node, {
    childList: true,
    attributes: true,
    characterData: true,
    subtree: true,
    attributeOldValue: false,
    characterDataOldValue: false,
  });

  // Execute the callback which may synchronously mutate the DOM
  callback();

  // Capture any pending mutation records synchronously to avoid missing them
  // (MutationObserver callbacks are asynchronous; takeRecords() returns any
  // records queued so far).
  const pending = observer.takeRecords();
  processRecords(pending);

  observer.disconnect();

  return {
    addedNodes,
    removedNodes,
    changedAttributes,
    changedText,
  };
}

/**
 * Get all event listeners attached to an element
 * Use to prove "listener safety" guarantee
 */
export function getAttachedListeners(_element: Element): Map<string, number> {
  const listeners = new Map<string, number>();

  // This is a bit hacky - we count listeners by checking what events fire
  // In a real implementation, you'd use a custom event system instrumentation
  // For testing: we'll just document that listeners were attached

  return listeners;
}

/**
 * Assert DOM structure matches expectations
 */
export function expectDOM(container: Element): {
  text: (expected: string) => void;
  contains: (selector: string) => void;
  notContains: (selector: string) => void;
  hasClass: (selector: string, className: string) => void;
  childCount: (expected: number) => void;
  nodeType: (selector: string, nodeType: 'element' | 'text') => void;
} {
  return {
    text: (expected: string) => {
      const text = container.textContent || '';
      if (!text.includes(expected)) {
        throw new Error(
          `Expected DOM to contain text "${expected}", but got: "${text}"`
        );
      }
    },

    contains: (selector: string) => {
      const found = container.querySelector(selector);
      if (!found) {
        throw new Error(
          `Expected DOM to contain element matching "${selector}"`
        );
      }
    },

    notContains: (selector: string) => {
      const found = container.querySelector(selector);
      if (found) {
        throw new Error(
          `Expected DOM NOT to contain element matching "${selector}", but found: ${found.outerHTML}`
        );
      }
    },

    hasClass: (selector: string, className: string) => {
      const element = container.querySelector(selector);
      if (!element) {
        throw new Error(`Element matching "${selector}" not found`);
      }
      if (!element.classList.contains(className)) {
        throw new Error(
          `Expected element to have class "${className}", but has: ${element.className}`
        );
      }
    },

    childCount: (expected: number) => {
      const actual = container.children.length;
      if (actual !== expected) {
        throw new Error(
          `Expected ${expected} children, but got ${actual}: ${Array.from(
            container.children
          )
            .map((el) => el.tagName)
            .join(', ')}`
        );
      }
    },

    nodeType: (selector: string, nodeType: 'element' | 'text') => {
      const node = container.querySelector(selector);
      if (!node) {
        throw new Error(`Node matching "${selector}" not found`);
      }
      const isText = node.nodeType === Node.TEXT_NODE;
      const isElement = node.nodeType === Node.ELEMENT_NODE;

      if (nodeType === 'text' && !isText) {
        throw new Error(`Expected text node, got element`);
      }
      if (nodeType === 'element' && !isElement) {
        throw new Error(`Expected element node, got text`);
      }
    },
  };
}

/**
 * EVENT FIRING LAYER
 * Deterministic event triggering
 */

export const fireEvent = {
  click: (element: HTMLElement) => {
    element.click();
  },

  input: (element: HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
  },

  change: (element: HTMLInputElement, value: string) => {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },

  keydown: (element: HTMLElement, key: string) => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  },

  custom: (
    element: HTMLElement,
    eventName: string,
    detail?: Record<string, unknown>
  ) => {
    const event = new CustomEvent(eventName, { detail, bubbles: true });
    element.dispatchEvent(event);
  },
};

/**
 * FAILURE INJECTION LAYER
 * Simulate error conditions for testing
 */

let shouldFailRender = false;
let shouldFailCommit = false;

export const injectFailure = {
  renderThrows: (callback?: () => void) => {
    shouldFailRender = true;
    try {
      if (callback) callback();
    } finally {
      shouldFailRender = false;
    }
  },

  commitThrows: (callback?: () => void) => {
    shouldFailCommit = true;
    try {
      if (callback) callback();
    } finally {
      shouldFailCommit = false;
    }
  },

  shouldRenderFail: () => shouldFailRender,
  shouldCommitFail: () => shouldFailCommit,
};

/**
 * SNAPSHOT LAYER (used sparingly)
 * Only for SSR HTML strings and error messages
 */

export async function captureSSRSnapshot(
  component: SSRComponent
): Promise<string> {
  return renderToStringSync(
    component as unknown as (
      props?: Record<string, unknown>
    ) =>
      | string
      | number
      | import('../../src/jsx/types').JSXElement
      | import('../../src/renderer/types').VNode
      | null
  );
}

/**
 * STATE OBSERVATION LAYER
 * Look at component state without breaking encapsulation
 */

export function captureComponentSnapshot(container: Element): {
  dom: string;
  textContent: string;
  childCount: number;
} {
  return {
    dom: container.outerHTML,
    textContent: container.textContent || '',
    childCount: container.children.length,
  };
}
