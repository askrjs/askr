import type { RenderableChild } from '../common/vnode';
import { getCurrentComponentInstance } from './component-scope';
import { createSSRPortalHost } from './portal-ssr';
import { writeSSRPortal } from './portal-ssr';
import { setPortalErrorParent } from './portal-lifetime';
import { createPortalSlot } from './portal-lifetime';
import type { Portal } from './portal';

/** Create a new named {@link Portal} channel with its own host and content. */
export function definePortal<
  T extends RenderableChild = RenderableChild,
>(): Portal<T> {
  const ssrPortalKey = {};

  if (typeof createPortalSlot === 'function') {
    const slot = createPortalSlot<T>();

    function PortalHost() {
      const serverHost = createSSRPortalHost(ssrPortalKey, false);
      if (serverHost) {
        return serverHost;
      }
      const host = getCurrentComponentInstance();
      if (host?.fn === PortalHost) {
        setPortalErrorParent(host, slot.getOwner());
      }
      return slot.read();
    }

    PortalHost.render = function PortalRender(props: { children?: T }) {
      if (writeSSRPortal(ssrPortalKey, props.children)) {
        return null;
      }
      const owner = getCurrentComponentInstance();
      slot.write(
        props.children,
        owner ? { instance: owner, generation: owner.owner.identity } : null
      );
      return null;
    };

    return PortalHost as Portal<T>;
  }

  let mounted = false;
  let value: T | undefined;

  function PortalHostFallback() {
    mounted = true;
    return value as unknown;
  }

  PortalHostFallback.render = function PortalRenderFallback(props: {
    children?: T;
  }) {
    if (!mounted) return null;
    value = props.children;
    return null;
  };

  return PortalHostFallback as Portal<T>;
}
