import type { ComponentInstance } from './instance';
import type { ContextFrame } from '../context/context';
import { setComponentVNodeIdentity } from './capabilities';
import { captureInlineRenderSnapshot } from '../transactions/render';
import { resolveChildScopeAuthor } from '../ownership/child-scope';

/** Capture and mutate retained execution together, before evaluating user code. */
export function prepareRetainedComponentUpdate(
  instance: ComponentInstance,
  props: ComponentInstance['props'],
  vnode: object,
  resolveKey: (node: unknown) => string | number | undefined,
  parent: ComponentInstance | null,
  resolveIsRoot: (node: unknown) => boolean,
  frame: ContextFrame | null | undefined
): void {
  captureInlineRenderSnapshot(instance);
  instance.props = props;
  setComponentVNodeIdentity(instance, vnode, parent, resolveKey);
  instance.isRoot = resolveIsRoot(vnode);
  instance.portalScope = parent?.portalScope ?? instance.portalScope;
  // Control-flow child-scope records stay non-strict; inherit from the
  // component that declared the control flow instead.
  const author = resolveChildScopeAuthor(parent);
  if (author) instance.cleanupStrict = author.cleanupStrict;
  if (frame) instance.ownerFrame = frame;
}
