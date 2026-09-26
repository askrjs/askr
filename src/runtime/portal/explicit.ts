import type { RenderableChild } from '../../common/vnode';
import { getCurrentComponentInstance } from '../component/scope';
import { createSSRPortalHost } from './ssr';
import { writeSSRPortal } from './ssr';
import { setPortalErrorParent } from './lifetime';
import { retirePortalHostContent } from './lifetime';
import {
  capturePortalHostContent,
  retireCapturedPortalContent,
} from './lifetime';
import { createPortalSlot } from './lifetime';
import { ownCleanup } from '../ownership/record';
import { registerCommitEffect } from '../component/lifecycle';
import type { Portal } from './portal';

/** Create a new named {@link Portal} channel with its own host and content. */
export function definePortal<
  T extends RenderableChild = RenderableChild,
>(): Portal<T> {
  const ssrPortalKey = {};

  if (typeof createPortalSlot === 'function') {
    const slot = createPortalSlot<T>();
    let currentHost: ReturnType<typeof getCurrentComponentInstance> = null;
    const cleanupOwners = new WeakSet<object>();

    function PortalHost() {
      const serverHost = createSSRPortalHost(ssrPortalKey, false);
      if (serverHost) {
        return serverHost;
      }
      const host = getCurrentComponentInstance();
      if (host?.fn === PortalHost) {
        currentHost = host;
        setPortalErrorParent(host, slot.getOwner());
      }
      return slot.read();
    }

    PortalHost.render = function PortalRender(props: { children?: T }) {
      if (writeSSRPortal(ssrPortalKey, props.children)) {
        return null;
      }
      const owner = getCurrentComponentInstance();
      if (owner) {
        const generation = owner.owner.identity;
        if (!cleanupOwners.has(generation)) {
          cleanupOwners.add(generation);
          ownCleanup(owner.owner, () => {
            const currentOwner = slot.getOwner();
            if (
              currentOwner?.instance !== owner ||
              currentOwner.generation !== generation
            )
              return;
            retirePortalHostContent(currentHost);
            slot.write(undefined, null);
          });
        }
      }
      const previousOwner = slot.getOwner();
      const previousValue = slot.peek();
      registerCommitEffect(
        {},
        () => undefined,
        () => slot.write(previousValue, previousOwner)
      );
      const departed =
        previousOwner &&
        (previousOwner.instance !== owner ||
          previousOwner.generation !== owner?.owner.identity)
          ? capturePortalHostContent(currentHost)
          : [];
      if (
        departed.length &&
        !registerCommitEffect(
          {},
          () => retireCapturedPortalContent(departed),
          () => undefined
        )
      )
        retireCapturedPortalContent(departed);
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
