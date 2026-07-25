# SSG Guide

SSG is an advanced build-time feature for teams that need pre-rendered HTML output.

Use Static Site Generation (SSG) to pre-render Askr routes into `.html` files at build time.

SSG can await build-time route expansion such as `entries()`, but each page is
rendered by the synchronous SSR engine. Async components, async `resource()`
loaders, and async document renderers are rejected during the page render.

## What SSG generates

- Route HTML files: `/` -> `index.html`, `/about` -> `about/index.html`
- Build metadata: `metadata.json` with per-route status, file sizes, and render durations
- When built through `askr ssg`, a canonical `sitemap.xml`

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
`entries()` from route records. Route definitions are shared with SPA and SSR;
there is no separate raw SSG route array.

## Parameterized routes

Use `entries()` when one route template should expand into many concrete pages:

```ts
import { createStaticGen } from '@askrjs/askr/ssg';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/blog/{slug}', BlogPostPage, {
    entries: async () =>
      getPosts().map((post: { slug: string }) => ({ slug: post.slug })),
  });
});
const ssg = createStaticGen({
  registry,
  outputDir: './dist/static',
});
```

## Data overrides

Provide route-keyed SSR data when components need pre-supplied values:

```ts
const ssg = createStaticGen({
  registry,
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

The installed Askr CLI loads `.ts` configs itself; no separate `tsx` command
or global loader setup is required.

Required args:

- `--config <path>`: `.ts` config file
- `--output <dir>`: output directory for generated files

## Config file shape

```ts
import { createRouteRegistry, route } from '@askrjs/askr/router';

export const registry = createRouteRegistry(() => {
  route('/', HomePage);
  route('/about', AboutPage);
});

export const dataOverrides = {
  '/': { appName: 'askr' },
};

export const seed = 12345;
export const siteUrl = 'https://example.com';
export const sitemap = {
  defaults: { changeFrequency: 'weekly' as const },
  routes: {
    '/404': false,
    '/about': {
      lastModified: '2026-07-18',
      priority: 0.8,
      alternates: { en: '/about', fr: '/fr/a-propos' },
    },
  },
};
// Omit this for deterministic single-worker generation (the default).
export const concurrency = 1;
```

The CLI requires an absolute HTTP(S) `siteUrl` so sitemap locations are valid.
It includes successful routes and routes skipped as unchanged by incremental
generation, while omitting failed routes and wildcard templates. Sitemap route
entries can override the canonical URL, `lastModified`, `changeFrequency`,
`priority`, and `hreflang` alternates. Set an entry to `false`, or return
`false` from `sitemap.resolve(route)`, to exclude a non-indexable route. Set
`sitemap: false` to explicitly disable sitemap generation.

Set `parallelism: 'auto'` when host CPU-based worker selection is desired. It
uses the Node 18-compatible CPU-count fallback when `availableParallelism()` is
not available.

## Output safety

Full generation writes into a sibling staging directory and replaces the prior
site only after every route, metadata file, and manifest is complete. A failed
full generation therefore leaves the last complete output untouched.

Incremental route updates use a temporary file and rename it into place, so a
failed route write also preserves that route's previously published HTML.

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
