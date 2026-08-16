# SSG Guide

SSG is an advanced build-time feature for teams that need pre-rendered HTML output.

Use Static Site Generation (SSG) to pre-render Askr routes into `.html` files at build time.

SSG can await build-time route expansion such as `entries()`, but each page is
rendered by the synchronous SSR engine. Async components, async `resource()`
loaders, and async document renderers are rejected during the page render.

## Hydration bundle boundaries

The browser boot path loads only the runtime needed for the hydrated route.
Portal hosting, deferred route rendering, and route-authoring implementation
are not retained by `hydrateSPA()` itself. They enter a client bundle only when
application code imports those capabilities. In particular, a client route
module that imports `route()`, `group()`, or other declaration helpers is an
explicit authoring import; hydration verification does not add a second
framework-owned dependency on that authoring implementation.

Import `Portal`, `DefaultPortal`, or `definePortal` from the foundations entry
when a route needs portals. Loading that entry also installs the automatic
default host used by SPA, SSR, and SSG rendering. Routes that do not import the
portal capability do not pay for its runtime.

Hydration markup verification preserves the server-rendered loading branch for
a `resource()` without preloaded resource data. This supports browser-only
loaders that return a synchronous placeholder on the server: verification does
not start the loader, and the real client component starts it only after
hydration commits. SSR and SSG remain strict when an async resource is
encountered during the actual server render.

Static pages can also be opened with client-only query strings or hashes. Strict
verification compares the DOM with the queryless URL that generated the static
HTML, then hydration applies the browser URL to the adopted route tree. For SSR
responses that were rendered from a query or hash, Askr records that render URL
in the hydration envelope and verifies against it exactly.

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
Generated component styles are exposed as request-local `context.styles`. Askr
warns when a document renderer omits a non-empty registration set; use
`styleRegistrationValidation: 'error'` to make that omission fail the affected
route during a build. Applications that intentionally externalize all generated
rules can opt out with `styleRegistrationValidation: 'off'`.

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
falls back to `os.cpus()` when `availableParallelism()` is unavailable.

## Output safety

Full generation writes into a sibling staging directory and replaces the prior
site only after every route, metadata file, and manifest is complete. A failed
full generation therefore leaves the last complete output untouched. Calls
that target the same resolved output directory are serialized within a process
so their staging-directory swaps cannot interfere with one another.

Before rendering, Askr rejects routes whose concrete output paths collide. The
comparison is case-insensitive on every host, preventing a configuration that
works on a case-sensitive development filesystem from overwriting a different
route on a case-insensitive deployment filesystem.

Incremental route updates use a temporary file and rename it into place, so a
failed route write also preserves that route's previously published HTML.
When incremental mode is requested without a compatible manifest, `mode` in the
result is `full`. If that fallback full build fails, successfully rendered
routes report `written: false` because the atomic output was not published.

## metadata.json

The generator writes `metadata.json` into the output directory with:

- `generatedAt`
- `totalRoutes`, `successful`, `failed`
- `totalDuration`
- `routes[]`: per-route `path`, `filePath`, `fileSize`, `renderDuration`, `resourceCount`, `status`, `error`

The in-memory `SSGResult.routes[]` entries also preserve the original exception
as `errorCause` and identify the failing route and phase (`load` or `render`) in
`errorContext`. These fields are intentionally omitted from `metadata.json`
because exceptions are not serializable. With source maps enabled, the cause's
stack points back to authored component and loader sources; without source maps,
the same route and phase context remains available even when the stack contains
bundled locations.

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
