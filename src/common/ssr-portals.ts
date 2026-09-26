/**
 * Server portals: hosts write a token that is replaced by the final content
 * written to their portal once the render root completes, so host and
 * writer order does not matter.
 */

import type { RenderableChild } from './vnode';
import { ELEMENT_TYPE, type JSXElement } from './jsx';
import { getActiveRenderContext } from './render-context';
import { createSSRPortalHostToken, SSR_PORTAL_HOST } from './portal';

const DEFAULT_SSR_PORTAL_KEY = {};

function getSSRPortalSlot(key: object) {
  const context = getActiveRenderContext();
  if (context?.mode !== 'ssr') {
    return null;
  }

  let slot = context.ssrPortals.slots.get(key);
  if (!slot) {
    slot = {
      hasValue: false,
      value: undefined,
      hosts: [],
    };
    context.ssrPortals.slots.set(key, slot);
  }
  return { context, slot };
}

function createSSRPortalHost(
  key: object,
  automatic: boolean,
  defaultPortal = false
): JSXElement | null {
  const current = getSSRPortalSlot(key);
  if (!current) {
    return null;
  }

  const token = createSSRPortalHostToken(
    current.context.ssrPortals.nextHostId++
  );
  current.slot.hosts.push({ token, automatic, defaultPortal });
  return {
    $$typeof: ELEMENT_TYPE,
    type: SSR_PORTAL_HOST,
    props: { token },
  } as unknown as JSXElement;
}

function writeSSRPortal(
  key: object,
  children: RenderableChild | undefined
): boolean {
  const current = getSSRPortalSlot(key);
  if (!current) {
    return false;
  }
  current.slot.hasValue = true;
  current.slot.value = children;
  return true;
}

export {
  DEFAULT_SSR_PORTAL_KEY,
  getSSRPortalSlot,
  createSSRPortalHost,
  writeSSRPortal,
};
