import { captureOwnerRange, releaseOwnerRange } from '../renderer/dom-range';
import {
  detachPortalHostOutput,
  isComponentHostDetached,
} from '../renderer/portal-host';
import {
  clearChildScopeHost,
  captureChildScopeHost,
  resolveScopeBoundary,
  prepareScopeRemoval,
  recordRemovedScopeBoundary,
  teardownScopeHost,
  hasUnmountedComponentHost,
} from '../renderer/scope-host';
import type { RendererCapabilities } from '../runtime/renderer-capabilities';
import type { RuntimeRendererHost } from './contracts/core';
import { applyComponentResult } from '../renderer/component-application';
import { classifyUpdate } from '../renderer/component-fast-path';
import { recordInlineComponentHost } from '../renderer/dom-ownership';
import {
  componentView,
  executionRecord,
  installOwnershipViews,
} from './ownership';

const nativeHosts = new WeakMap<RuntimeRendererHost, RendererCapabilities>();

/** Only extension hosts pay for callback translation. Keep their receiver and
 * look up methods at invocation time so later host mutation stays observable. */
export function adaptRendererHost(
  host: RuntimeRendererHost
): RendererCapabilities {
  installOwnershipViews();
  const native = nativeHosts.get(host);
  if (native) return native;
  return {
    captureComponentHost: captureOwnerRange,
    releaseComponentHost: releaseOwnerRange,
    detachPortalHostOutput,
    isComponentHostDetached,
    clearChildScopeHost,
    captureChildScopeHost,
    resolveScopeBoundary,
    prepareScopeRemoval,
    recordRemovedScopeBoundary,
    teardownScopeHost,
    hasUnmountedComponentHost,
    recordInlineComponentHost,
    applyComponentResult,
    classifyComponentUpdate: classifyUpdate,
    evaluate: (...args) => {
      if (args[3]) componentView(args[3]);
      return host.evaluate(
        ...(args as unknown as Parameters<RuntimeRendererHost['evaluate']>)
      );
    },
    cleanupInstancesUnder: (...args) => host.cleanupInstancesUnder(...args),
    replaceComponentRange: (...args) => {
      componentView(args[0]);
      return host.replaceComponentRange(
        ...(args as unknown as Parameters<
          RuntimeRendererHost['replaceComponentRange']
        >)
      );
    },
    get resolveChildScopeRange() {
      return host.resolveChildScopeRange
        ? (
            ...args: Parameters<
              NonNullable<RendererCapabilities['resolveChildScopeRange']>
            >
          ) => {
            componentView(args[0].componentInstance);
            return host.resolveChildScopeRange!(
              ...(args as unknown as Parameters<
                NonNullable<RuntimeRendererHost['resolveChildScopeRange']>
              >)
            );
          }
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

/** Keep the native host's identity and writable properties. Only inbound
 * extension records require adoption; ordinary owners are already authoritative. */
export function rendererHostView(
  capabilities: RendererCapabilities
): RuntimeRendererHost {
  installOwnershipViews();
  const host = capabilities as unknown as RuntimeRendererHost;
  if (nativeHosts.has(host)) return host;
  const evaluate = capabilities.evaluate;
  capabilities.evaluate = function (...args) {
    if (args[3] && !args[3].owner) {
      executionRecord(
        args[3] as unknown as NonNullable<
          Parameters<RuntimeRendererHost['evaluate']>[3]
        >
      );
    }
    return evaluate.apply(this, args);
  };
  const replace = capabilities.replaceComponentRange;
  capabilities.replaceComponentRange = function (...args) {
    if (!args[0].owner) {
      executionRecord(
        args[0] as unknown as Parameters<
          RuntimeRendererHost['replaceComponentRange']
        >[0]
      );
    }
    return replace.apply(this, args);
  };
  const resolve = capabilities.resolveChildScopeRange;
  if (resolve) {
    capabilities.resolveChildScopeRange = function (...args) {
      if (!args[0].componentInstance.owner) {
        executionRecord(
          args[0].componentInstance as unknown as Parameters<
            RuntimeRendererHost['replaceComponentRange']
          >[0]
        );
      }
      return resolve.apply(this, args);
    };
  }
  nativeHosts.set(host, capabilities);
  return host;
}
