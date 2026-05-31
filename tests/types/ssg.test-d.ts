import { expectAssignable, expectType } from 'tsd';
import {
  createStaticGen,
  type DiscoveredResources,
  type RouteConfig,
  type RouteRenderReason,
  type RouteRenderResult,
  type RouteRenderStatus,
  type SSGGenerateOptions,
  type SSGMetadata,
  type SSGMode,
  type SSGOptions,
  type SSGResult,
} from '@askrjs/askr/ssg';
import type { RouteHandler } from '@askrjs/askr/router';

const handler: RouteHandler = (params) => params.slug ?? 'home';

const routeConfig: RouteConfig = {
  path: '/posts/{slug}',
  handler,
  params: { slug: 'first-post' },
  entries: async () => [{ slug: 'first-post' }],
  invalidationKeys: ['posts'],
};
expectAssignable<RouteConfig>(routeConfig);

const options: SSGOptions = {
  routes: [{ path: '/', handler: () => 'home' }, routeConfig],
  outputDir: './dist',
  parallelism: 'auto',
};
expectAssignable<SSGOptions>(options);

const ssg = createStaticGen(options);
expectType<Promise<SSGResult>>(ssg.generate());

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
