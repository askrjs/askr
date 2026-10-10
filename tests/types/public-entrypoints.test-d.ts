import { expectAssignable, expectType } from 'tsd';
import * as rootSurface from '@askrjs/askr';
import { RenderDepthError, type RenderDiagnosticsOptions } from '@askrjs/askr';
import * as resourcesSurface from '@askrjs/askr/resources';
import * as routerSurface from '@askrjs/askr/router';
import * as foundationsSurface from '@askrjs/askr/foundations';

// @ts-expect-error root package does not expose JSXElement
type HiddenRootJSXElement = import('@askrjs/askr').JSXElement;
expectAssignable<unknown>({} as HiddenRootJSXElement);

declare const renderFailure: unknown;
if (renderFailure instanceof RenderDepthError) {
  expectType<unknown>(renderFailure.cause);
  expectAssignable<Error>(renderFailure);
}

expectAssignable<RenderDiagnosticsOptions>({
  slowRenderWarnings: false,
  slowRenderThresholdMs: 20,
});
expectType<void>(
  rootSurface.registerSSRStyle('consumer-style', '.consumer {}')
);
expectType<() => void>(
  rootSurface.configureRenderDiagnostics({ slowRenderWarnings: false })
);
// @ts-expect-error runtime construction is no longer published
void rootSurface.createRuntime;
// @ts-expect-error renderer host construction is no longer published
void rootSurface.createDOMRendererHost;
// @ts-expect-error jsx runtime entrypoint no longer exposes element brand
void ({} as typeof import('@askrjs/askr/jsx-runtime')).ELEMENT_TYPE;
// @ts-expect-error jsx dev runtime entrypoint no longer exposes element brand
void ({} as typeof import('@askrjs/askr/jsx-dev-runtime')).ELEMENT_TYPE;

// @ts-expect-error root package does not expose startup helpers
void rootSurface.createIsland;
// @ts-expect-error root package does not expose router helpers
void rootSurface.route;
// @ts-expect-error root package does not expose resource helpers
void rootSurface.resource;
// @ts-expect-error root package does not expose component helpers
void rootSurface.ErrorBoundary;
// @ts-expect-error data helpers are published from @askrjs/askr/data only
void rootSurface.createQuery;
// @ts-expect-error root package does not expose data helpers
void rootSurface.queryScope;
// @ts-expect-error root package does not expose foundations helpers
void rootSurface.Portal;
// @ts-expect-error root package does not expose testing helpers
void rootSurface.mockQuery;
// @ts-expect-error root package does not expose testing helpers
void rootSurface.matchRoute;
// @ts-expect-error root package does not expose testing helpers
void rootSurface.render;

// @ts-expect-error resources subpath no longer re-exports data helpers
void resourcesSurface.createQuery;
// @ts-expect-error resources subpath no longer re-exports data helpers
void resourcesSurface.createMutation;
// @ts-expect-error resources subpath no longer re-exports data helpers
void resourcesSurface.invalidate;
// @ts-expect-error resources subpath no longer re-exports removed aliases
type RemovedDataResult = import('@askrjs/askr/resources').DataResult;
expectAssignable<unknown>({} as RemovedDataResult);

// @ts-expect-error slim foundations entrypoint no longer exposes utilities
void foundationsSurface.composeHandlers;
// @ts-expect-error slim foundations entrypoint no longer exposes interactions
void foundationsSurface.pressable;
// @ts-expect-error slim foundations entrypoint no longer exposes state helpers
void foundationsSurface.isControlled;
// @ts-expect-error slim foundations entrypoint no longer exposes icon helpers
void foundationsSurface.IconBase;
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
void foundationsSurface.createCollection;
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
void foundationsSurface.createLayer;

// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface._applyManifest;
// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface._drainLazy;
// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface.getNamespaceRoutes;
// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface.unloadNamespace;
// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface.getLoadedNamespaces;
// @ts-expect-error internal router helpers are not part of the public barrel
void routerSurface.setServerLocation;
// Server adapters and application tests share the canonical router owner.
const registry = routerSurface.createRouteRegistry(() => {});
expectType<routerSurface.RouteMatch | null>(
  routerSurface.matchRoute('/', { registry })
);
expectAssignable<
  routerSurface.RouteRequestResult | Promise<routerSurface.RouteRequestResult>
>(routerSurface.resolveRouteRequest('/', { registry }));
