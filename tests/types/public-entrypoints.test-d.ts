import { expectAssignable, expectType } from 'tsd';
import * as rootSurface from '@askrjs/askr';
import type {
  AskrRuntimeOptions,
  RuntimeKeyedReorderDecision,
  RuntimeRendererHost,
} from '@askrjs/askr';
import {
  createIsland,
  createIslands,
  createSPA,
  hydrateSPA,
  cleanupApp,
  hasApp,
} from '@askrjs/askr/boot';
import { ErrorBoundary } from '@askrjs/askr/components';
import * as dataSurface from '@askrjs/askr/data';
import * as resourcesSurface from '@askrjs/askr/resources';
import * as routerSurface from '@askrjs/askr/router';
import * as testingSurface from '@askrjs/askr/testing';
import * as foundationsSurface from '@askrjs/askr/foundations';
import { createStaticGen } from '@askrjs/askr/ssg';
import {
  renderResolvedToStringSync,
  renderToStream,
  renderToString,
  renderToStringSync,
  resolveRequest,
} from '@askrjs/askr/ssr';
import { Fragment, jsx, jsxs } from '@askrjs/askr/jsx-runtime';
import { jsxDEV } from '@askrjs/askr/jsx-dev-runtime';

// @ts-expect-error root package does not expose JSXElement
expectType<never>(null as unknown as import('@askrjs/askr').JSXElement);

expectType<typeof createIsland>(createIsland);
expectType<typeof createIslands>(createIslands);
expectType<typeof createSPA>(createSPA);
expectType<typeof hydrateSPA>(hydrateSPA);
expectType<typeof cleanupApp>(cleanupApp);
expectType<typeof hasApp>(hasApp);
expectType<typeof ErrorBoundary>(ErrorBoundary);
expectType<typeof createStaticGen>(createStaticGen);
expectType<typeof renderToString>(renderToString);
expectType<typeof renderToStringSync>(renderToStringSync);
expectType<typeof renderToStream>(renderToStream);
expectType<typeof resolveRequest>(resolveRequest);
expectType<typeof renderResolvedToStringSync>(renderResolvedToStringSync);
expectType<typeof jsx>(jsx);
expectType<typeof jsxs>(jsxs);
expectType<typeof Fragment>(Fragment);
expectType<typeof jsxDEV>(jsxDEV);
expectType<typeof rootSurface.jsx>(rootSurface.jsx);
expectType<typeof rootSurface.jsxs>(rootSurface.jsxs);
expectType<typeof rootSurface.Fragment>(rootSurface.Fragment);
expectType<typeof rootSurface.createRuntime>(rootSurface.createRuntime);
expectType<typeof rootSurface.getDefaultRuntime>(rootSurface.getDefaultRuntime);
expectType<typeof rootSurface.AskrRuntime>(rootSurface.AskrRuntime);
expectType<rootSurface.AskrRuntime>(rootSurface.createRuntime());
expectType<rootSurface.AskrRuntime>(rootSurface.getDefaultRuntime());
expectAssignable<AskrRuntimeOptions>({});
expectType<RuntimeRendererHost>(null as unknown as RuntimeRendererHost);
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
expectType<typeof testingSurface.mockQuery>(testingSurface.mockQuery);
expectType<typeof testingSurface.queryState>(testingSurface.queryState);
expectType<typeof testingSurface.createInvalidationRecorder>(
  testingSurface.createInvalidationRecorder
);
expectType<typeof dataSurface.queryScope>(dataSurface.queryScope);
expectType<typeof testingSurface.matchRoute>(testingSurface.matchRoute);
expectType<typeof testingSurface.getRouteWarnings>(
  testingSurface.getRouteWarnings
);
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
// @ts-expect-error root package does not expose data helpers
expectType<never>(rootSurface.createQuery);
// @ts-expect-error root package does not expose data helpers
expectType<never>(rootSurface.queryScope);
// @ts-expect-error root package does not expose foundations helpers
expectType<never>(rootSurface.Portal);
// @ts-expect-error root package does not expose testing helpers
expectType<never>(rootSurface.mockQuery);
// @ts-expect-error root package does not expose testing helpers
expectType<never>(rootSurface.matchRoute);

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
