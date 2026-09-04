import type { RendererCapabilities } from '../runtime/renderer-capabilities';
import type { RuntimeRendererHost } from './contracts/core';

const nativeHosts = new WeakMap<RuntimeRendererHost, RendererCapabilities>();

/** Only extension hosts pay for callback translation. Keep their receiver and
 * look up methods at invocation time so later host mutation stays observable. */
export function adaptRendererHost(
  host: RuntimeRendererHost
): RendererCapabilities {
  const native = nativeHosts.get(host);
  if (native) return native;
  return {
    evaluate: (...args) =>
      host.evaluate(
        ...(args as unknown as Parameters<RuntimeRendererHost['evaluate']>)
      ),
    cleanupInstancesUnder: (...args) => host.cleanupInstancesUnder(...args),
    replaceComponentRange: (...args) =>
      host.replaceComponentRange(
        ...(args as unknown as Parameters<
          RuntimeRendererHost['replaceComponentRange']
        >)
      ),
    get resolveChildScopeRange() {
      return host.resolveChildScopeRange
        ? (
            ...args: Parameters<
              NonNullable<RendererCapabilities['resolveChildScopeRange']>
            >
          ) =>
            host.resolveChildScopeRange!(
              ...(args as unknown as Parameters<
                NonNullable<RuntimeRendererHost['resolveChildScopeRange']>
              >)
            )
        : undefined;
    },
    teardownNodeSubtree: (...args) => host.teardownNodeSubtree(...args),
    populateKeyMapForElement: (...args) =>
      host.populateKeyMapForElement(...args),
    getKeyMapForElement: (...args) => host.getKeyMapForElement(...args),
    isKeyedReorderFastPathEligible: (...args) =>
      host.isKeyedReorderFastPathEligible(...args),
    markReactivePropsDirtySource: (...args) =>
      host.markReactivePropsDirtySource(
        ...(args as unknown as Parameters<
          RuntimeRendererHost['markReactivePropsDirtySource']
        >)
      ),
  };
}

/** Until ownership records diverge, the native host itself is its stable view.
 * Sharing the object also preserves writes, deletion, and property descriptors. */
export function rendererHostView(
  capabilities: RendererCapabilities
): RuntimeRendererHost {
  const host = capabilities as unknown as RuntimeRendererHost;
  nativeHosts.set(host, capabilities);
  return host;
}
