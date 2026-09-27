import { expectAssignable, expectType } from 'tsd';
import {
  SSRDataMissingError,
  createRenderContext,
  getRenderContext,
  renderRouteRequestToString,
  renderToStream,
  renderToString,
  renderToStringSync,
  withRenderContext,
  withRenderContextAsync,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type RenderRouteRequestOptions,
  type RenderRouteRequestResult,
  type SSRComponent,
  type SSRStyleRegistration,
  type SSRStyleRegistrationValidation,
  type VNode,
} from '@askrjs/askr/ssr';
import {
  resolveRouteRequest,
  type RouteRegistry,
  type RouteRequestResult,
} from '@askrjs/askr/router';

declare const registry: RouteRegistry;

declare const styleRegistration: SSRStyleRegistration;
expectAssignable<SSRStyleRegistration>(styleRegistration);
expectAssignable<SSRStyleRegistrationValidation>('warn');
expectAssignable<SSRStyleRegistrationValidation>('error');
expectAssignable<SSRStyleRegistrationValidation>('off');

const renderContext = createRenderContext(42, { url: '/users/42' });
expectType<string>(renderContext.url);
expectType<number>(renderContext.seed);
expectType<AbortSignal | undefined>(renderContext.signal);
expectType<string | undefined>(getRenderContext()?.url);
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
expectType<string>(
  renderToString({
    url: '/users/42',
    registry,
    styleRegistrationValidation: 'error',
  })
);
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
expectType<SSRDataMissingError>(new SSRDataMissingError('consumer'));

// @ts-expect-error request resolution without rendering is resolveRouteRequest in /router
void ({} as typeof import('@askrjs/askr/ssr')).resolveRequest;
// @ts-expect-error resolved rendering is internal; use renderToString
void ({} as typeof import('@askrjs/askr/ssr')).renderResolvedToStringSync;

// Request resolution without rendering goes through the router.
expectType<RouteRequestResult | Promise<RouteRequestResult>>(
  resolveRouteRequest('/users/42', { registry, mode: 'ssr' })
);
export async function redirectTarget(): Promise<string | undefined> {
  const result: RouteRequestResult = await resolveRouteRequest('/users/42', {
    registry,
    mode: 'ssr',
  });
  if (result?.kind === 'redirect') {
    expectType<string>(result.to);
    return result.to;
  }
  return undefined;
}
