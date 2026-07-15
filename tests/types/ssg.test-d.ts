import { expectAssignable, expectType } from 'tsd';
import {
  createStaticGen,
  type DocumentRenderArgs,
  type DocumentRenderContext,
  type DocumentRenderer,
  type DiscoveredResources,
  type RouteConfig,
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
import type { RouteHandler, RouteRegistry } from '@askrjs/askr/router';

const handler: RouteHandler = (params) => params.slug ?? 'home';
declare const registry: RouteRegistry;

const routeConfig: RouteConfig = {
  path: '/posts/{slug}',
  handler,
  params: { slug: 'first-post' },
  entries: async () => [{ slug: 'first-post' }],
  invalidationKeys: ['posts'],
};
expectAssignable<RouteConfig>(routeConfig);

const generatedRouteConfig: RouteConfig<'/posts/{slug}'> = {
  path: '/posts/{slug}',
  handler,
  entries: async () => [{ slug: 'generated-post' }],
};
expectAssignable<RouteConfig<'/posts/{slug}'>>(generatedRouteConfig);

const documentRenderer: DocumentRenderer = ({ appHtml, context }) => {
  expectType<string>(appHtml);
  expectType<DocumentRenderContext>(context);
  return `<html>${appHtml}</html>`;
};
expectAssignable<DocumentRenderer>(documentRenderer);

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

createStaticGen({
  routes: [
    {
      path: '/posts/{slug}',
      handler,
      entries: async () => [{ slug: 'generated-post' }],
    },
  ],
  outputDir: './dist',
  document: documentRenderer,
});

createStaticGen({
  routes: [
    {
      path: '/posts/{slug}',
      component: (props: { slug?: string }, context) => {
        expectType<Record<string, unknown> | undefined>(context?.ssr?.data);
        return props.slug ?? 'missing';
      },
    },
  ],
  outputDir: './dist',
});

const options: SSGOptions = {
  routes: [{ path: '/', handler: () => 'home' }, routeConfig],
  outputDir: './dist',
  document: documentRenderer,
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

const discoveredResources: DiscoveredResources = {
  posts: {
    count: 1,
    dependencies: ['slug'],
  },
};
expectAssignable<DiscoveredResources>(discoveredResources);

void ({
  path: '/posts/{slug}',
  handler,
  // @ts-expect-error params key must match route path placeholders
  params: { id: 'wrong-key' },
} satisfies RouteConfig<'/posts/{slug}'>);

void ({
  path: '/posts/{slug}',
  handler,
  // @ts-expect-error entries key must match route path placeholders
  entries: async () => [{ id: 'wrong-key' }],
} satisfies RouteConfig<'/posts/{slug}'>);

createStaticGen({
  routes: [
    {
      path: '/posts/{slug}',
      handler,
      // @ts-expect-error entries key must match route path placeholders
      entries: async () => [{ id: 'wrong-key' }],
    },
  ],
  outputDir: './dist',
});
