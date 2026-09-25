import { readFunctionChildValue } from '../reactivity/readable';
import {
  getExecutionContextFrame,
  withContext,
  type ContextFrame,
} from '../context/context';
import {
  getVNodeContextFrame,
  markVNodeTreeWithContextFrame,
} from '../context/vnode';
import { createChildScope, type ChildScope } from '../ownership/child-scope';
import { withLazyComponentScope } from './scope';
import type { ComponentInstance } from './instance';

/**
 * Where a function child bound directly to the DOM runs: a component render of
 * its own, so hooks, `Show`/`For` and `readScope` behave as in a component.
 * The instance is created only when the function first needs one, so a plain
 * read (`{() => count()}`) costs no component.
 */
export interface FunctionChildOwner {
  /** Read `child` (see `readFunctionChildValue`) as this owner's render. */
  read(child: () => unknown): unknown;
  dispose(): void;
}

export function createFunctionChildOwner(
  parent: ComponentInstance | null
): FunctionChildOwner {
  let scope: ChildScope | null = null;
  let frame: ContextFrame | null = null;
  const create = (): ComponentInstance => {
    scope = createChildScope(parent, 'function-child');
    scope.componentInstance.ownerFrame = frame;
    return scope.componentInstance;
  };
  return {
    read(child) {
      frame = getVNodeContextFrame(child) ?? parent?.ownerFrame ?? null;
      const instance = scope ? scope.componentInstance : null;
      if (instance) instance.ownerFrame = frame;
      const run = () =>
        markVNodeTreeWithContextFrame(
          withLazyComponentScope(instance, create, () =>
            readFunctionChildValue(child)
          ),
          frame
        );
      return frame ? withContext(getExecutionContextFrame(frame), run) : run();
    },
    dispose() {
      scope?.dispose();
      scope = null;
    },
  };
}
