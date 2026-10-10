import { expect, test } from 'vitest';

// Exercise the installed JavaScript independently of its handwritten types.
test('should expose the contracted @askrjs/askr runtime surface', async () => {
  const surface = await import('@askrjs/askr');
  for (const name of [
    'configureRenderDiagnostics',
    'createElement',
    'createRef',
    'cspNonce',
    'CspNonceScope',
    'defineScope',
    'derive',
    'Fragment',
    'getSignal',
    'jsx',
    'jsxs',
    'readScope',
    'registerSSRStyle',
    'RenderDepthError',
    'selector',
    'state',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/boot runtime surface', async () => {
  const surface = await import('@askrjs/askr/boot');
  for (const name of [
    'cleanupApp',
    'createIsland',
    'createIslands',
    'createSPA',
    'hasApp',
    'hydrateSPA',
    'replaceDataRuntime',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/components runtime surface', async () => {
  const surface = await import('@askrjs/askr/components');
  for (const name of ['ErrorBoundary']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/control runtime surface', async () => {
  const surface = await import('@askrjs/askr/control');
  for (const name of ['Case', 'For', 'Match', 'Show']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/foundations runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations');
  for (const name of [
    'DefaultPortal',
    'definePortal',
    'layout',
    'Portal',
    'Presence',
    'Slot',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/foundations/utilities runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations/utilities');
  for (const name of [
    'composeHandlers',
    'composeRefs',
    'formatId',
    'mergeProps',
    'setRef',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
  for (const name of ['ariaDisabled', 'ariaExpanded', 'ariaSelected']) {
    expect(surface).not.toHaveProperty(name);
  }
});

test('should expose the contracted @askrjs/askr/foundations/interactions runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations/interactions');
  for (const name of [
    'applyInteractionPolicy',
    'dismissable',
    'focusable',
    'hoverable',
    'mergeInteractionProps',
    'pressable',
    'rovingFocus',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/foundations/state runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations/state');
  for (const name of ['controllableState']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
  for (const name of [
    'isControlled',
    'makeControllable',
    'resolveControllable',
  ]) {
    expect(surface).not.toHaveProperty(name);
  }
});

test('should expose the contracted @askrjs/askr/foundations/structures runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations/structures');
  for (const name of [
    'cloneElement',
    'createCollection',
    'DefaultPortal',
    'definePortal',
    'isElement',
    'layout',
    'Portal',
    'Presence',
    'Slot',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
  for (const name of ['createLayer']) {
    expect(surface).not.toHaveProperty(name);
  }
});

test('should expose the contracted @askrjs/askr/foundations/icon runtime surface', async () => {
  const surface = await import('@askrjs/askr/foundations/icon');
  for (const name of ['IconBase']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/resources runtime surface', async () => {
  const surface = await import('@askrjs/askr/resources');
  for (const name of [
    'capture',
    'documentVisible',
    'on',
    'resource',
    'routeActive',
    'stream',
    'task',
    'timer',
    'watch',
    'windowFocused',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/data runtime surface', async () => {
  const surface = await import('@askrjs/askr/data');
  for (const name of [
    'createDataRuntime',
    'disposeDataRuntime',
    'createMutation',
    'createQuery',
    'createQueryCollection',
    'createQueryPrefetchContext',
    'defineQuery',
    'defineServerQueries',
    'dehydrateDataRuntime',
    'getDefaultDataRuntime',
    'hydrateDataRuntime',
    'invalidate',
    'invalidateOnInterval',
    'prefetchQuery',
    'queryScope',
    'refreshOnActivity',
    'serveQuery',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/testing runtime surface', async () => {
  const surface = await import('@askrjs/askr/testing');
  for (const name of [
    'cleanup',
    'click',
    'createInvalidationRecorder',
    'createMutationTestRegistry',
    'createQueryTestRegistry',
    'dispatch',
    'flush',
    'getRouteWarnings',
    'mockQuery',
    'mutationState',
    'render',
    'renderRoute',
    'submit',
    'type',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
  for (const name of ['matchRoute', 'mount', 'queryState']) {
    expect(surface).not.toHaveProperty(name);
  }
});

test('should expose the contracted @askrjs/askr/fx runtime surface', async () => {
  const surface = await import('@askrjs/askr/fx');
  for (const name of [
    'debounceEvent',
    'idle',
    'once',
    'raf',
    'rafEvent',
    'retry',
    'scheduleEventHandler',
    'scheduleIdle',
    'scheduleRetry',
    'scheduleTimeout',
    'throttle',
    'throttleEvent',
    'timeout',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/router runtime surface', async () => {
  const surface = await import('@askrjs/askr/router');
  for (const name of [
    'allow',
    'createRouteRegistry',
    'currentAuth',
    'currentRoute',
    'defer',
    'deny',
    'fallback',
    'forbidden',
    'group',
    'index',
    'isDeferred',
    'lazy',
    'lazyRouteData',
    'Link',
    'matchRoute',
    'navigate',
    'notFound',
    'onRouteChange',
    'Outlet',
    'page',
    'reconcileRouteMeta',
    'redirect',
    'Resolve',
    'resolveDeferredValues',
    'resolveRouteMeta',
    'resolveRouteRequest',
    'route',
    'routeData',
    'RouteDataLoadError',
    'serializeRouteMeta',
    'to',
    'unauthorized',
    'updateRouteQuery',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/actions runtime surface', async () => {
  const surface = await import('@askrjs/askr/actions');
  for (const name of ['action', 'ActionForm', 'defineAction']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/ssr runtime surface', async () => {
  const surface = await import('@askrjs/askr/ssr');
  for (const name of [
    'createRenderContext',
    'escapeHtml',
    'getRenderContext',
    'renderRouteRequest',
    'renderRouteRequestToString',
    'renderToStream',
    'renderToString',
    'renderToStringSync',
    'SSRAccessDecisionError',
    'SSRDataMissingError',
    'withRenderContext',
    'withRenderContextAsync',
  ]) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/ssg runtime surface', async () => {
  const surface = await import('@askrjs/askr/ssg');
  for (const name of ['createStaticGen']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});

test('should expose the contracted @askrjs/askr/jsx-runtime runtime surface', async () => {
  const surface = await import('@askrjs/askr/jsx-runtime');
  for (const name of ['Fragment', 'jsx', 'jsxs']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
  for (const name of ['jsxDEV']) {
    expect(surface).not.toHaveProperty(name);
  }
});

test('should expose the contracted @askrjs/askr/jsx-dev-runtime runtime surface', async () => {
  const surface = await import('@askrjs/askr/jsx-dev-runtime');
  for (const name of ['Fragment', 'jsxDEV']) {
    expect(surface).toHaveProperty(name);
    expect((surface as Record<string, unknown>)[name]).not.toBeUndefined();
  }
});
