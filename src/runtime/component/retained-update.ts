import type { ComponentInstance } from './instance';
import type { ContextFrame } from '../context/context';
import { setComponentVNodeIdentity } from './capabilities';
import { captureInlineRenderSnapshot } from '../transactions/render';

/** Capture and mutate retained execution together, before evaluating user code. */
export function prepareRetainedComponentUpdate(
  instance: ComponentInstance,
  props: ComponentInstance['props'],
  vnode: object,
  resolveKey: () => string | number | undefined,
  parent: ComponentInstance | null,
  resolveIsRoot: () => boolean,
  frame: ContextFrame | null | undefined
): void {
  captureInlineRenderSnapshot(instance);
  instance.props = props;
  setComponentVNodeIdentity(instance, vnode, parent, resolveKey);
  instance.isRoot = resolveIsRoot();
  instance.portalScope = parent?.portalScope ?? instance.portalScope;
  if (parent) instance.cleanupStrict = parent.cleanupStrict;
  if (frame) instance.ownerFrame = frame;
}
