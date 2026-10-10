import { expectAssignable, expectType } from 'tsd';
import * as rootSurface from '@askrjs/askr';
import { RenderDepthError, type RenderDiagnosticsOptions } from '@askrjs/askr';
import * as resourcesSurface from '@askrjs/askr/resources';
import * as routerSurface from '@askrjs/askr/router';
import * as foundationsSurface from '@askrjs/askr/foundations';
import * as utilitiesSurface from '@askrjs/askr/foundations/utilities';
import * as stateSurface from '@askrjs/askr/foundations/state';
import * as structuresSurface from '@askrjs/askr/foundations/structures';
import * as testingSurface from '@askrjs/askr/testing';
import * as jsxRuntimeSurface from '@askrjs/askr/jsx-runtime';

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

// The 0.5.0 contraction removes these exact named/entrypoint pairs. Direct
// property/type lookup makes a restored export an unused directive error.
// @ts-expect-error use a typed aria-disabled attribute/local props expression
void utilitiesSurface.ariaDisabled;
// @ts-expect-error use a typed aria-expanded attribute/local props expression
void utilitiesSurface.ariaExpanded;
// @ts-expect-error use a typed aria-selected attribute/local props expression
void utilitiesSurface.ariaSelected;
// @ts-expect-error use native DOM or application-owned structural event types
type Gone0 = import('@askrjs/askr/foundations/utilities').DefaultPreventable;
expectAssignable<unknown>({} as Gone0);
// @ts-expect-error use native DOM or application-owned structural event types
type Gone1 = import('@askrjs/askr/foundations/utilities').FocusLikeEvent;
expectAssignable<unknown>({} as Gone1);
// @ts-expect-error use native DOM or application-owned structural event types
type Gone2 = import('@askrjs/askr/foundations/utilities').KeyboardLikeEvent;
expectAssignable<unknown>({} as Gone2);
// @ts-expect-error use native DOM or application-owned structural event types
type Gone3 = import('@askrjs/askr/foundations/utilities').PointerLikeEvent;
expectAssignable<unknown>({} as Gone3);
// @ts-expect-error use native DOM or application-owned structural event types
type Gone4 = import('@askrjs/askr/foundations/utilities').PropagationStoppable;
expectAssignable<unknown>({} as Gone4);
// @ts-expect-error stateless controlled-mode selection is application-owned
void stateSurface.isControlled;
// @ts-expect-error stateless controlled-mode selection is application-owned
void stateSurface.resolveControllable;
// @ts-expect-error stateless setter coordination is application-owned
void stateSurface.makeControllable;
// @ts-expect-error bespoke layer stacks are application-owned
void structuresSurface.createLayer;
// @ts-expect-error bespoke layer stacks are application-owned
type Gone5 = import('@askrjs/askr/foundations/structures').Layer;
expectAssignable<unknown>({} as Gone5);
// @ts-expect-error bespoke layer stacks are application-owned
type Gone6 = import('@askrjs/askr/foundations/structures').LayerOptions;
expectAssignable<unknown>({} as Gone6);
// @ts-expect-error bespoke layer stacks are application-owned
type Gone7 = import('@askrjs/askr/foundations/structures').LayerManager;
expectAssignable<unknown>({} as Gone7);
// @ts-expect-error use testing render with the same component/options
void testingSurface.mount;
// @ts-expect-error use mockQuery(data) and mockQuery state builders
void testingSurface.queryState;
// @ts-expect-error import matchRoute from the router owner
void testingSurface.matchRoute;
// @ts-expect-error import AuthContext from @askrjs/auth
type Gone8 = import('@askrjs/askr/router').AuthContext;
expectAssignable<unknown>({} as Gone8);
// @ts-expect-error import AuthRequirement from @askrjs/auth
type Gone9 = import('@askrjs/askr/router').AuthRequirement;
expectAssignable<unknown>({} as Gone9);
// @ts-expect-error use RouteRecord indexed access for diagnostics
type Gone10 = import('@askrjs/askr/router').ParsedSegment;
expectAssignable<unknown>({} as Gone10);
// @ts-expect-error use RouteRecord indexed access for diagnostics
type Gone11 = import('@askrjs/askr/router').PageScopeRecord;
expectAssignable<unknown>({} as Gone11);
// @ts-expect-error use RouteRecord indexed access for diagnostics
type Gone12 = import('@askrjs/askr/router').LayoutScopeRecord;
expectAssignable<unknown>({} as Gone12);
// @ts-expect-error use router Route for custom context route bindings
type Gone13 = import('@askrjs/askr/ssr').SSRRoute;
expectAssignable<unknown>({} as Gone13);
// @ts-expect-error use supported SSGResult per-route resourceCount reporting
type Gone14 = import('@askrjs/askr/ssg').DiscoveredResources;
expectAssignable<unknown>({} as Gone14);
// @ts-expect-error author a RouteRegistry through router route/RouteOptions
type Gone15 = import('@askrjs/askr/ssg').RouteConfig;
expectAssignable<unknown>({} as Gone15);
// @ts-expect-error import the policy type from the ssr owner
type Gone16 = import('@askrjs/askr/ssg').SSRStyleRegistrationValidation;
expectAssignable<unknown>({} as Gone16);
// @ts-expect-error import the development factory from jsx-dev-runtime
void jsxRuntimeSurface.jsxDEV;
// @ts-expect-error import manual JSX types from jsx-runtime
type Gone17 = import('@askrjs/askr/jsx-dev-runtime').JSXComponent;
expectAssignable<unknown>({} as Gone17);
// @ts-expect-error import manual JSX types from jsx-runtime
type Gone18 = import('@askrjs/askr/jsx-dev-runtime').JSXElement;
expectAssignable<unknown>({} as Gone18);
// @ts-expect-error import manual JSX types from jsx-runtime
type Gone19 = import('@askrjs/askr/jsx-dev-runtime').JSXElementType;
expectAssignable<unknown>({} as Gone19);

// @ts-expect-error SSGOptions accepts a registry, without a route-array generic
type RemovedSSGGeneric = import('@askrjs/askr/ssg').SSGOptions<[]>;
expectAssignable<unknown>({} as RemovedSSGGeneric);
