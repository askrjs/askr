import { createRendererCapabilities } from '../renderer';
import { rendererHostView } from './renderer';
import type { RuntimeRendererHost } from './contracts/core';
import type {
  DOMComponentOwner,
  DOMChildScope,
  DOMReactiveSource,
  DOMRendererHost,
} from './contracts/dom-renderer';
export type {
  DOMComponentOwner,
  DOMChildScope,
  DOMReactiveSource,
  DOMRendererRange,
  DOMRendererEvaluation,
  DOMRendererCleanup,
  DOMRendererScopes,
  DOMRendererKeys,
  DOMRendererReactivity,
  DOMRendererHost,
} from './contracts/dom-renderer';

function handles<RecordType extends object, Handle extends object>() {
  const outward = new WeakMap<RecordType, Handle>();
  const inward = new WeakMap<Handle, RecordType>();
  return {
    wrap(record: RecordType): Handle {
      let handle = outward.get(record);
      if (!handle) {
        handle = Object.freeze({}) as Handle;
        outward.set(record, handle);
        inward.set(handle, record);
      }
      return handle;
    },
    unwrap(handle: Handle): RecordType {
      const record = inward.get(handle);
      if (!record) throw new TypeError('[Askr] Invalid DOM renderer handle.');
      return record;
    },
  };
}

/** Construct a complete DOM adapter without installing it. Handles belong only
 * to this factory; native delegates validate them before accessing the DOM. */
export function createDOMRendererHost(
  configure: (native: DOMRendererHost) => DOMRendererHost
): RuntimeRendererHost {
  const renderer = rendererHostView(createRendererCapabilities());
  const owners = handles<
    Parameters<RuntimeRendererHost['replaceComponentRange']>[0],
    DOMComponentOwner
  >();
  const scopes = handles<
    Parameters<NonNullable<RuntimeRendererHost['resolveChildScopeRange']>>[0],
    DOMChildScope
  >();
  const sources = handles<
    Parameters<RuntimeRendererHost['markReactivePropsDirtySource']>[0],
    DOMReactiveSource
  >();
  const native: DOMRendererHost = {
    evaluation: {
      evaluate(node, target, context, owner) {
        renderer.evaluate(
          node,
          target,
          context,
          owner === undefined ? undefined : owners.unwrap(owner)
        );
      },
      replaceComponentRange(owner, result, host) {
        return renderer.replaceComponentRange(
          owners.unwrap(owner),
          result,
          host
        );
      },
    },
    cleanup: {
      cleanupInstancesUnder(node) {
        renderer.cleanupInstancesUnder(node);
      },
      teardownNodeSubtree(node) {
        renderer.teardownNodeSubtree(node);
      },
    },
    scopes: {
      resolveChildScopeRange(scope) {
        const range = renderer.resolveChildScopeRange!(scopes.unwrap(scope));
        return range
          ? Object.freeze({
              start: range.start,
              end: range.end,
              single: range.single,
            })
          : null;
      },
    },
    keys: {
      populateKeyMapForElement(parent) {
        renderer.populateKeyMapForElement(parent);
      },
      getKeyMapForElement(parent) {
        return renderer.getKeyMapForElement(parent);
      },
      isKeyedReorderFastPathEligible(parent, children, oldKeyMap) {
        return renderer.isKeyedReorderFastPathEligible(
          parent,
          children,
          oldKeyMap
        );
      },
    },
    reactivity: {
      markReactivePropsDirtySource(source) {
        renderer.markReactivePropsDirtySource(sources.unwrap(source));
      },
    },
  };
  const required = Object.fromEntries(
    Object.entries(native).map(([role, methods]) => [
      role,
      Object.keys(methods),
    ])
  );
  const host = configure(native);
  for (const role of Object.keys(required) as Array<keyof DOMRendererHost>) {
    for (const method of required[role]) {
      if (
        typeof (
          host?.[role] as unknown as Record<string, unknown> | undefined
        )?.[method] !== 'function'
      )
        throw new TypeError(`[Askr] DOM renderer requires ${role}.${method}.`);
    }
  }
  return {
    evaluate(node, target, context, owner) {
      host.evaluation.evaluate(
        node,
        target,
        context,
        owner === undefined ? undefined : owners.wrap(owner)
      );
    },
    replaceComponentRange(owner, result, target) {
      return host.evaluation.replaceComponentRange(
        owners.wrap(owner),
        result,
        target
      );
    },
    cleanupInstancesUnder(node) {
      host.cleanup.cleanupInstancesUnder(node);
    },
    teardownNodeSubtree(node) {
      host.cleanup.teardownNodeSubtree(node);
    },
    resolveChildScopeRange(scope) {
      return host.scopes.resolveChildScopeRange(scopes.wrap(scope));
    },
    populateKeyMapForElement(parent) {
      host.keys.populateKeyMapForElement(parent);
    },
    getKeyMapForElement(parent) {
      return host.keys.getKeyMapForElement(parent);
    },
    isKeyedReorderFastPathEligible(parent, children, oldKeyMap) {
      return host.keys.isKeyedReorderFastPathEligible(
        parent,
        children,
        oldKeyMap
      );
    },
    markReactivePropsDirtySource(source) {
      host.reactivity.markReactivePropsDirtySource(sources.wrap(source));
    },
  };
}
