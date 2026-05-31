import { expectAssignable, expectError, expectType } from 'tsd';
import {
  SSRDataMissingError,
  renderToStream,
  renderToString,
  renderToStringSync,
  resolveRequest,
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

expectType<string>(renderToStringSync(() => 'ok'));
expectType<string>(renderToString(() => 'ok'));
expectType<string>(renderToString({ url: '/users/42', routes }));
expectType<void>(
  renderToStream({
    url: '/users/42',
    routes,
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
