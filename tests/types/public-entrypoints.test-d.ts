import { expectAssignable, expectType } from 'tsd';
import * as rootSurface from '@askrjs/askr';
import type {
  AskrRuntimeOptions,
  RenderDiagnosticsOptions,
  RuntimeKeyedReorderDecision,
} from '@askrjs/askr';
import * as dataSurface from '@askrjs/askr/data';
import * as resourcesSurface from '@askrjs/askr/resources';
import * as routerSurface from '@askrjs/askr/router';
import * as foundationsSurface from '@askrjs/askr/foundations';
import { renderResolvedToStringSync } from '@askrjs/askr/ssr';
import type { RouteRegistry } from '@askrjs/askr/router';

// @ts-expect-error root package does not expose JSXElement
expectType<never>(null as unknown as import('@askrjs/askr').JSXElement);

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
declare const registry: RouteRegistry;
expectType<string>(
  renderResolvedToStringSync({ url: '/', registry, handler: () => 'ok' })
);
expectType<rootSurface.AskrRuntime>(rootSurface.createRuntime());
expectType<rootSurface.AskrRuntime>(rootSurface.getDefaultRuntime());
expectAssignable<AskrRuntimeOptions>({});
expectAssignable<RuntimeKeyedReorderDecision>({
  useFastPath: false,
  totalKeyed: 0,
  totalChildren: 0,
  currentKeyCount: 0,
  moveCount: 0,
  lisLen: 0,
  hasPropChanges: false,
  isWholeKeyedList: false,
});
// @ts-expect-error jsx runtime entrypoint no longer exposes element brand
void ({} as typeof import('@askrjs/askr/jsx-runtime')).ELEMENT_TYPE;
// @ts-expect-error jsx dev runtime entrypoint no longer exposes element brand
void ({} as typeof import('@askrjs/askr/jsx-dev-runtime')).ELEMENT_TYPE;

// @ts-expect-error root package does not expose startup helpers
expectType<never>(rootSurface.createIsland);
// @ts-expect-error root package does not expose router helpers
expectType<never>(rootSurface.route);
// @ts-expect-error root package does not expose resource helpers
expectType<never>(rootSurface.resource);
// @ts-expect-error root package does not expose component helpers
expectType<never>(rootSurface.ErrorBoundary);
expectType<typeof dataSurface.createQuery>(rootSurface.createQuery);
// @ts-expect-error root package does not expose data helpers
expectType<never>(rootSurface.queryScope);
// @ts-expect-error root package does not expose foundations helpers
expectType<never>(rootSurface.Portal);
// @ts-expect-error root package does not expose testing helpers
expectType<never>(rootSurface.mockQuery);
// @ts-expect-error root package does not expose testing helpers
expectType<never>(rootSurface.matchRoute);
// @ts-expect-error root package does not expose testing helpers
expectType<never>(rootSurface.render);

// @ts-expect-error resources subpath no longer re-exports data helpers
expectType<never>(resourcesSurface.createQuery);
// @ts-expect-error resources subpath no longer re-exports data helpers
expectType<never>(resourcesSurface.createMutation);
// @ts-expect-error resources subpath no longer re-exports data helpers
expectType<never>(resourcesSurface.invalidate);
// @ts-expect-error resources subpath no longer re-exports removed aliases
expectType<never>(resourcesSurface.DataResult);

// @ts-expect-error slim foundations entrypoint no longer exposes utilities
expectType<never>(foundationsSurface.composeHandlers);
// @ts-expect-error slim foundations entrypoint no longer exposes interactions
expectType<never>(foundationsSurface.pressable);
// @ts-expect-error slim foundations entrypoint no longer exposes state helpers
expectType<never>(foundationsSurface.isControlled);
// @ts-expect-error slim foundations entrypoint no longer exposes icon helpers
expectType<never>(foundationsSurface.IconBase);
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
expectType<never>(foundationsSurface.createCollection);
// @ts-expect-error slim foundations entrypoint no longer exposes structural registries
expectType<never>(foundationsSurface.createLayer);

// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface._applyManifest);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface._drainLazy);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface.getNamespaceRoutes);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface.unloadNamespace);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface.getLoadedNamespaces);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface.resolveRouteRequest);
// @ts-expect-error internal router helpers are not part of the public barrel
expectType<never>(routerSurface.setServerLocation);
// @ts-expect-error route test helpers live in @askrjs/askr/testing
expectType<never>(routerSurface.matchRoute);
