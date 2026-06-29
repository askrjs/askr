# SSG Guide

SSG is an advanced build-time feature for teams that need pre-rendered HTML output.

Use Static Site Generation (SSG) to pre-render Askr routes into `.html` files at build time.

## What SSG generates

- Route HTML files: `/` -> `index.html`, `/about` -> `about/index.html`
- Build metadata: `metadata.json` with per-route status, file sizes, and render durations

## Programmatic API

Import from the SSG subpath:

```ts
import { createStaticGen } from '@askrjs/askr/ssg';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', () => <HomePage />);
  route('/about', () => <AboutPage />);
});

const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
  seed: 12345,
});

const result = await ssg.generate();
console.log(result.successful, result.totalRoutes);
```

## Document boundary

Use the optional `document` callback when routes should stay app-only and SSG
should still write full HTML documents:

```ts
import { createStaticGen } from '@askrjs/askr/ssg';
import { registry } from './routes';

const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
  document: ({ appHtml, context }) => `<!doctype html>
<html lang="en">
  <head>
    <title>${context.pathname}</title>
  </head>
  <body>
    ${appHtml}
  </body>
</html>`,
});
```

The callback receives the concrete route URL plus the matched route template, so
parameterized routes can share one app route table across SPA, SSR, and SSG.

## Route config

When you pass a registry, SSG reads path, handler, access metadata, and
`entries()` from route records. You can still pass raw route entries for
one-off generation. Each raw route entry supports:

- `path`: route path (supports params like `/blog/{slug}` and final named splats like `/admin/files/{*path}`; splat names are trimmed, must be non-empty, and `*` is reserved)
- `component` or `handler`: render function
- `params`: values for path placeholders
- `entries`: async param expansion for generating many concrete pages from one template
- `props`: optional base props merged into rendered params

## Parameterized routes

Use `entries()` when one route template should expand into many concrete pages:

```ts
import { createStaticGen } from '@askrjs/askr/ssg';

const ssg = createStaticGen({
  routes: [
    {
      path: '/blog/{slug}',
      component: BlogPostPage,
      entries: async () =>
        getPosts().map((post: { slug: string }) => ({ slug: post.slug })),
    },
  ],
  outputDir: './dist/static',
});
```

## Data overrides

Provide route-keyed SSR data when components need pre-supplied values:

```ts
const ssg = createStaticGen({
  routes,
  outputDir: './dist/static',
  dataOverrides: {
    '/': { appName: 'askr' },
    '/about': { section: 'about' },
  },
});
```

For parameterized routes, prefer concrete paths such as `/blog/first-post`.

## CLI usage

The unified CLI expects a TypeScript config file for SSG generation.

```bash
npx @askrjs/cli ssg --config ./examples/ssg.config.ts --output ./dist/static
```

If you already have the CLI installed, you can also run the direct bin:

```bash
askr-ssg --config ./examples/ssg.config.ts --output ./dist/static
```

Required args:

- `--config <path>`: `.ts` config file
- `--output <dir>`: output directory for generated files

## Config file shape

```ts
import type { RouteConfig } from '@askrjs/askr/ssg';

export const routes: RouteConfig[] = [
  { path: '/', component: HomePage },
  { path: '/about', component: AboutPage },
];

export const dataOverrides = {
  '/': { appName: 'askr' },
};

export const seed = 12345;
export const concurrency = 10;
```

## metadata.json

The generator writes `metadata.json` into the output directory with:

- `generatedAt`
- `totalRoutes`, `successful`, `failed`
- `totalDuration`
- `routes[]`: per-route `path`, `filePath`, `fileSize`, `renderDuration`, `resourceCount`, `status`, `error`

## Current limits

- Config is TypeScript-only for CLI mode.
- Output is always `.html` files.
- Watch mode and ISR are not part of this flow.
- Rendering is still synchronous per route even though route matching is isolated per render.
- The `document` callback is synchronous and returns the final HTML string for each route.

## Next

- [SSR Guide](ssr.md)
- [Router Guide](router.md)
- [CLI docs](https://github.com/askrjs/askr-cli/tree/main/docs/README.md)
- [API Overview](../reference/api.md)
