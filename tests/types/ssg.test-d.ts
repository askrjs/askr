import { expectAssignable, expectError, expectType } from 'tsd';
import {
  createStaticGen,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type RouteRenderReason,
  type RouteRenderResult,
  type RouteRenderStatus,
  type SSGGenerateOptions,
  type SSGAssetSource,
  type SSGMetadata,
  type SSGMode,
  type SSGOptions,
  type SSGResult,
} from '@askrjs/askr/ssg';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import type { RouteHandler, RouteOptions } from '@askrjs/askr/router';
import type { SSRStyleRegistrationValidation } from '@askrjs/askr/ssr';

const handler: RouteHandler = (params) => params.slug ?? 'home';
const registry = createRouteRegistry(() => {
  route('/posts/{slug}', handler, {
    entries: async () => [{ slug: 'generated-post' }],
    invalidationKeys: ['posts'],
  });
});

const documentRenderer: DocumentRenderer = ({ appHtml, context }) => {
  expectType<string>(appHtml);
  expectType<DocumentRenderContext>(context);
  return `<html>${appHtml}</html>`;
};
expectAssignable<DocumentRenderer>(documentRenderer);
expectAssignable<SSRStyleRegistrationValidation>('warn');
expectAssignable<SSRStyleRegistrationValidation>('error');
expectAssignable<SSRStyleRegistrationValidation>('off');

const documentArgs: DocumentRenderArgs = {
  appHtml: '<main>ok</main>',
  context: {
    mode: 'ssg',
    url: '/posts/generated-post',
    pathname: '/posts/generated-post',
    search: '',
    hash: '',
    params: { slug: 'generated-post' },
    data: { title: 'Generated Post' },
    seed: 12345,
    route: {
      path: '/posts/{slug}',
    },
  },
};
expectType<string>(documentRenderer(documentArgs));

const options: SSGOptions = {
  registry,
  outputDir: './dist',
  document: documentRenderer,
  styleRegistrationValidation: 'error',
  parallelism: 'auto',
};
expectAssignable<SSGOptions>(options);

const assetSource: SSGAssetSource = {
  from: './public',
  to: '.',
};
expectAssignable<SSGAssetSource>(assetSource);

const ssg = createStaticGen(options);
expectType<Promise<SSGResult>>(ssg.generate());

const registrySsg = createStaticGen({
  registry,
  outputDir: './dist',
  document: documentRenderer,
});
expectType<Promise<SSGResult>>(registrySsg.generate());

const generateOptions: SSGGenerateOptions = {
  mode: 'incremental',
  changedKeys: ['posts'],
  changedRoutes: ['/posts/first-post'],
  forceFull: false,
};
expectAssignable<SSGGenerateOptions>(generateOptions);
expectType<Promise<SSGResult>>(ssg.generate(generateOptions));

const config = ssg.getConfig();
expectType<number>(config.routeCount);
expectType<string>(config.outputDir);
expectType<number>(config.seed);
expectType<number>(config.concurrency);
expectType<number>(config.parallelism);
expectType<boolean>(config.hasDataOverrides);
expectType<SSGResult | null>(ssg.getResult());

declare const result: SSGResult;
expectType<string>(result.generatedAt);
expectType<number>(result.totalRoutes);
expectType<number>(result.successful);
expectType<number>(result.failed);
expectType<number>(result.totalDuration);
expectType<SSGMode>(result.mode);
expectType<RouteRenderResult[]>(result.routes);

declare const routeResult: RouteRenderResult;
expectType<RouteRenderStatus>(routeResult.status);
expectType<RouteRenderReason>(routeResult.reason);
expectType<string>(routeResult.path);
expectType<string>(routeResult.filePath);
expectType<string>(routeResult.html);

const routeRenderReason: RouteRenderReason = 'changed-route';
expectAssignable<RouteRenderReason>(routeRenderReason);

const metadata: SSGMetadata = {
  generatedAt: new Date().toISOString(),
  totalRoutes: 1,
  successful: 1,
  failed: 0,
  totalDuration: 10,
  mode: 'full',
  rebuilt: 1,
  skipped: 0,
  removed: 0,
  cacheHits: 0,
  invalidatedKeys: [],
  invalidatedRoutes: [],
  routes: [],
};
expectAssignable<SSGMetadata>(metadata);

const invalidPostOptions: RouteOptions<{ slug: string }> = {
  // @ts-expect-error entries keys must match the declared route placeholders
  entries: async () => [{ id: 'wrong-key' }],
};
void invalidPostOptions;

expectError(createStaticGen({ routes: [], outputDir: './dist' }));
