import { expectAssignable, expectError, expectType } from 'tsd';
import {
  SSRDataMissingError,
  renderToStream,
  renderToString,
  renderToStringSync,
  resolveRequest,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type SSRComponent,
  type SSRRoute,
  type VNode,
} from '@askrjs/askr/ssr';
import type { RouteManifest, RouteRequestResult } from '@askrjs/askr/router';

declare const manifest: RouteManifest;

const routes: SSRRoute[] = [
  {
    path: '/users/{id}',
    handler: (params) => params.id,
  },
];

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
expectType<string>(renderToString({ url: '/users/42', routes }));
expectType<string>(
  renderToString({ url: '/users/42', routes, document: documentRenderer })
);
expectType<void>(
  renderToStream({
    url: '/users/42',
    routes,
    document: documentRenderer,
    onChunk: (html) => {
      expectType<string>(html);
    },
    onComplete: () => {},
  })
);

expectType<Promise<RouteRequestResult>>(
  resolveRequest({ url: '/users/42', manifest })
);
expectType<Promise<RouteRequestResult>>(
  resolveRequest({ url: '/users/42', routes })
);
expectType<typeof SSRDataMissingError>(SSRDataMissingError);

expectError(resolveRequest({ url: '/users/42' }));
