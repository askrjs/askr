import type { ComponentFunction } from '../common/component';
import { assertSyncComponentResult } from '../common/promise';
import { ELEMENT_TYPE, Fragment } from '../jsx';
import { DefaultPortal } from '../core/api/portal';
import { CspNonceScope } from '../csp-nonce';

const AUTO_PORTAL = {
  $$typeof: ELEMENT_TYPE,
  type: DefaultPortal,
  props: { __askrAutoDefaultPortal: true },
  key: '__default_portal',
};

/**
 * Wrap a root's component: its output is followed by the automatic default
 * portal host, and the CSP nonce (if any) is provided to everything below.
 */
export function wrapRootRouteHandler(
  componentFn: ComponentFunction,
  cspNonce?: string
): ComponentFunction {
  const wrappedFn: ComponentFunction = (props, ctx) => {
    const out = componentFn(props, ctx);
    assertSyncComponentResult(out);
    const root = {
      $$typeof: ELEMENT_TYPE,
      type: Fragment,
      props: {
        children:
          out === undefined || out === null
            ? [AUTO_PORTAL]
            : [out, AUTO_PORTAL],
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
