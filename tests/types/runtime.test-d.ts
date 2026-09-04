import { expectError, expectType } from 'tsd';
import {
  AskrRuntime,
  createRuntime,
  getDefaultRuntime,
  type RuntimeRendererHost,
} from '@askrjs/askr';

const host: RuntimeRendererHost = {
  evaluate(node, target, context, owner) {
    expectType<unknown>(node);
    expectType<Element | null>(target);
    expectType<object | undefined>(context);
    if (owner) {
      expectType<string>(owner.id);
      expectType<Element | null>(owner.target);
      expectType<boolean>(owner.mounted);
      expectType<number>(owner.evaluationGeneration);
      expectType<number>(owner.lifecycleGeneration);
      expectType<AbortController | null>(owner.abortController);
      expectType<(() => void) | null>(owner.notifyUpdate);
      owner.notifyUpdate?.();
    }
  },
  cleanupInstancesUnder(node) {
    expectType<Node>(node);
  },
  replaceComponentRange(owner, result, host) {
    expectType<string>(owner.id);
    expectType<unknown>(result);
    expectType<Element | Comment>(host);
    return null;
  },
  resolveChildScopeRange(scope) {
    expectType<string | number>(scope.key);
    expectType<void>(scope.markDirty());
    return scope.range ?? null;
  },
  teardownNodeSubtree(node) {
    expectType<Node>(node);
  },
  populateKeyMapForElement(parent) {
    expectType<Element>(parent);
  },
  getKeyMapForElement(parent) {
    expectType<Element>(parent);
    return new Map<string | number, Element>();
  },
  isKeyedReorderFastPathEligible(parent, children, oldKeyMap) {
    expectType<Element>(parent);
    expectType<unknown[]>(children);
    expectType<Map<string | number, Element> | undefined>(oldKeyMap);
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
  markReactivePropsDirtySource(source) {
    expectType<unknown>(source());
  },
};

const runtime = new AskrRuntime({ renderer: host });
expectType<AskrRuntime>(
  createRuntime({ scheduler: runtime.scheduler, renderer: host })
);
expectType<AskrRuntime>(getDefaultRuntime());
expectType<RuntimeRendererHost>(runtime.renderer);
expectType<void>(runtime.configureRenderer(host));
expectType<void>(runtime.scheduler.enqueue(() => {}));
expectType<void>(runtime.scheduler.enqueueInLane('post', () => {}));
expectType<string>(runtime.scheduler.runWithSyncProgress(() => String(42)));
expectType<number>(runtime.scheduler.runInHandlerScope(() => 42, 'sync'));
expectType<Promise<void>>(runtime.scheduler.waitForFlush());
expectType<number>(runtime.scheduler.getState().laneQueues.reactive);
expectError(createRuntime({ renderer: {} }));
expectError(runtime.scheduler.enqueueInLane('unknown', () => {}));
expectError(
  runtime.configureRenderer({ ...host, replaceComponentRange: () => 42 })
);
