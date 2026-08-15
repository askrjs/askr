import { globalScheduler, type Scheduler } from './scheduler';
import type { ComponentInstance } from './component';
import type { ChildScope } from './child-scope';
import type { ReadableSource } from './readable';
import type { DOMRange } from '../common/dom-range';

/** Diagnostic breakdown of a keyed-list reorder decision, returned by {@link RuntimeRendererHost.isKeyedReorderFastPathEligible}. */
export interface RuntimeKeyedReorderDecision {
  useFastPath: boolean;
  totalKeyed: number;
  totalChildren: number;
  currentKeyCount: number;
  moveCount: number;
  lisLen: number;
  hasPropChanges: boolean;
  isWholeKeyedList: boolean;
}

/** The renderer implementation an {@link AskrRuntime} delegates DOM evaluation and cleanup to. */
export interface RuntimeRendererHost {
  evaluate(
    node: unknown,
    target: Element | null,
    context?: object,
    retainedOwner?: ComponentInstance
  ): void;
  cleanupInstancesUnder(node: Node): void;
  replaceComponentRange(
    instance: ComponentInstance,
    result: unknown,
    host: Element | Comment
  ): Node | null;
  resolveChildScopeRange?(scope: ChildScope): DOMRange | null;
  teardownNodeSubtree(root: Node): void;
  populateKeyMapForElement(parent: Element): void;
  getKeyMapForElement(
    parent: Element
  ): Map<string | number, Element> | undefined;
  isKeyedReorderFastPathEligible(
    parent: Element,
    children: unknown[],
    oldKeyMap: Map<string | number, Element> | undefined
  ): RuntimeKeyedReorderDecision;
  markReactivePropsDirtySource(source: ReadableSource<unknown>): void;
}

/** Options for {@link createRuntime}. */
export interface AskrRuntimeOptions {
  scheduler?: Scheduler;
  renderer?: RuntimeRendererHost;
}

function createMissingRendererHost(): RuntimeRendererHost {
  const missing = (method: string): never => {
    throw new Error(
      `[Askr] renderer host is not configured; cannot call ${method}().`
    );
  };

  return {
    evaluate() {
      missing('evaluate');
    },
    cleanupInstancesUnder() {
      missing('cleanupInstancesUnder');
    },
    replaceComponentRange() {
      return missing('replaceComponentRange');
    },
    teardownNodeSubtree() {
      missing('teardownNodeSubtree');
    },
    populateKeyMapForElement() {
      // Fast-lane callers treat an empty key map as a normal decline.
    },
    getKeyMapForElement() {
      return undefined;
    },
    isKeyedReorderFastPathEligible() {
      return {
        useFastPath: false,
        totalKeyed: 0,
        totalChildren: 0,
        currentKeyCount: 0,
        moveCount: 0,
        lisLen: 0,
        hasPropChanges: false,
        isWholeKeyedList: false,
      };
    },
    markReactivePropsDirtySource() {
      // Reactive prop tracking is renderer-owned and optional for runtimes.
    },
  };
}

/** A scheduler + renderer host pairing; owns scheduling and renderer wiring for an app instance. */
export class AskrRuntime {
  readonly scheduler: Scheduler;
  private rendererHost: RuntimeRendererHost;

  constructor(options: AskrRuntimeOptions = {}) {
    this.scheduler = options.scheduler ?? globalScheduler;
    this.rendererHost = options.renderer ?? createMissingRendererHost();
  }

  get renderer(): RuntimeRendererHost {
    return this.rendererHost;
  }

  configureRenderer(renderer: RuntimeRendererHost): void {
    this.rendererHost = renderer;
  }
}

export const defaultRuntime = new AskrRuntime({
  scheduler: globalScheduler,
});

/** Create a new {@link AskrRuntime} instance with its own scheduler/renderer wiring. */
export function createRuntime(options: AskrRuntimeOptions = {}): AskrRuntime {
  return new AskrRuntime(options);
}

/** Get the process-wide default {@link AskrRuntime}. */
export function getDefaultRuntime(): AskrRuntime {
  return defaultRuntime;
}

export function configureRuntimeRenderer(
  renderer: RuntimeRendererHost,
  runtime: AskrRuntime = defaultRuntime
): void {
  runtime.configureRenderer(renderer);
}
