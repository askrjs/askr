import { expectAssignable, expectError, expectType } from 'tsd';
import {
  SSRDataMissingError,
  createRenderContext,
  getRenderContext,
  renderRouteRequestToString,
  renderToStream,
  renderToString,
  renderToStringSync,
  resolveRequest,
  withRenderContext,
  withRenderContextAsync,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type RenderRouteRequestOptions,
  type RenderRouteRequestResult,
  type SSRComponent,
  type VNode,
} from '@askrjs/askr/ssr';
import type { RouteRegistry, RouteRequestResult } from '@askrjs/askr/router';

declare const registry: RouteRegistry;

const renderContext = createRenderContext(42, { url: '/users/42' });
expectType<ReturnType<typeof createRenderContext>>(renderContext);
expectType<ReturnType<typeof createRenderContext> | null>(getRenderContext());
expectType<string>(withRenderContext(renderContext, () => 'rendered'));
expectType<Promise<string>>(
  withRenderContextAsync(renderContext, async () => 'rendered')
);

const component: SSRComponent = (_props, context) => {
  expectType<AbortSignal | undefined>(context?.signal);
  return 'ok';
};

expectAssignable<SSRComponent>(component);

declare const vnode: VNode;
expectAssignable<VNode>(vnode);

const documentRenderer: DocumentRenderer = ({ appHtml, context }) => {
  expectType<string>(appHtml);
  expectType<DocumentRenderContext>(context);
  return `<html>${appHtml}</html>`;
};
expectAssignable<DocumentRenderer>(documentRenderer);

const documentArgs: DocumentRenderArgs = {
  appHtml: '<main>ok</main>',
  context: {
    mode: 'ssr',
    url: '/users/42',
    pathname: '/users/42',
    search: '',
    hash: '',
    params: { id: '42' },
    data: { ready: true },
    seed: 12345,
    route: {
      path: '/users/{id}',
    },
  },
};
expectType<string>(documentRenderer(documentArgs));

expectType<string>(renderToStringSync(() => 'ok'));
expectType<string>(renderToString(() => 'ok'));
expectType<string>(renderToString({ url: '/users/42', registry }));
expectType<void>(
  renderToStream({
    url: '/users/42',
    registry,
    document: documentRenderer,
    onChunk: (html) => {
      expectType<string>(html);
    },
    onComplete: () => {},
  })
);
expectType<void>(
  renderToStream({
    url: '/users/42',
    registry,
    onChunk: (html) => expectType<string>(html),
    onComplete: () => {},
  })
);

const renderRouteRequestOptions: RenderRouteRequestOptions = {
  url: '/users/42',
  registry,
};
expectType<Promise<RenderRouteRequestResult>>(
  renderRouteRequestToString(renderRouteRequestOptions)
);
expectType<Promise<RouteRequestResult>>(
  resolveRequest({ url: '/users/42', registry })
);
expectError(resolveRequest({ url: '/users/42', routes: [] }));
expectType<typeof SSRDataMissingError>(SSRDataMissingError);

expectError(resolveRequest({ url: '/users/42' }));
