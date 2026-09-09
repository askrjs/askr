import type { ComponentFunction } from '../common/component';
import { assertSyncComponentResult } from '../common/promise';
import { getDefaultPortalHost } from '../common/default-portal-runtime';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import { CspNonceScope } from '../csp-nonce';

export function wrapRootRouteHandler(
  componentFn: ComponentFunction,
  cspNonce?: string
): ComponentFunction {
  const wrappedFn: ComponentFunction = (props, ctx) => {
    const out = componentFn(props, ctx);
    assertSyncComponentResult(out);
    const portalVNode = {
      $$typeof: ELEMENT_TYPE,
      type: getDefaultPortalHost(),
      props: { __askrAutoDefaultPortal: true },
      key: '__default_portal',
    } as unknown;

    const root = {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [portalVNode]
            : [out, portalVNode],
      },
    } as ReturnType<ComponentFunction>;
    return cspNonce === undefined
      ? root
      : CspNonceScope({ value: cspNonce, children: root });
  };

  Object.defineProperty(wrappedFn, 'name', {
    value: componentFn.name || 'Component',
  });

  return wrappedFn;
}
