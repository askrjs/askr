import type { RenderableChild } from '../../common/vnode';
import type { JSXElement } from '../../common/jsx';
import { getActiveRenderContext } from '../../common/render-context';
import {
  createSSRPortalAnchorToken,
  createSSRPortalHostToken,
  SSR_PORTAL_ANCHOR,
  SSR_PORTAL_HOST,
} from '../../common/portal';
import { ELEMENT_TYPE } from '../../jsx';

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
  automatic: boolean
): JSXElement | null {
  const current = getSSRPortalSlot(key);
  if (!current) {
    return null;
  }

  const token = createSSRPortalHostToken(
    current.context.ssrPortals.nextHostId++
  );
  current.slot.hosts.push({ token, automatic });
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

function createSSRPortalAnchor(): JSXElement | null {
  const context = getActiveRenderContext();
  if (context?.mode !== 'ssr') {
    return null;
  }
  const token = createSSRPortalAnchorToken(context.ssrPortals.nextHostId++);
  return {
    $$typeof: ELEMENT_TYPE,
    type: SSR_PORTAL_ANCHOR,
    props: { token },
  } as unknown as JSXElement;
}
export {
  DEFAULT_SSR_PORTAL_KEY,
  getSSRPortalSlot,
  createSSRPortalHost,
  writeSSRPortal,
  createSSRPortalAnchor,
};
