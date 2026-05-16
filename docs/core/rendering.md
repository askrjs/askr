# Core: Rendering

Askr supports three output modes: DOM (SPA), server-rendered HTML (SSR), and pre-rendered
HTML files (SSG). The same component code works in all three modes.

## DOM rendering (SPA)

The default mode. Components are rendered into the DOM via `createSPA({ root, manifest })`
or `createIsland({ root, component })`.

See [Runtime](./runtime.md) for boot APIs.

## Server-Side Rendering (SSR)

Askr renders components to an HTML string on the server. The client hydrates the result.

### Current status

The shipped SSR API is synchronous and best suited to static or preloaded data.
Async components and async server data resolution are not part of the finished SSR story yet.
Use deterministic inputs for stable hydration output.

### URL-based rendering

Use the URL-based helper when the server needs to resolve routes explicitly:

```ts
import { renderToString } from '@askrjs/askr/ssr';

const html = renderToString({ url: '/users/42"q=active' });
```

The URL is parsed and matched against registered routes. The matched component renders
to an HTML string.

### Client hydration

```ts
import { hydrateSPA } from '@askrjs/askr/boot';
import { getManifest, registerRoutes, route } from '@askrjs/askr/router';

registerRoutes(() => {
  route('/', () => <Home />);
});

await hydrateSPA({ root: 'app', manifest: getManifest() });
```

## Static Site Generation (SSG)

SSG pre-renders Askr routes into `.html` files at build time.

### Programmatic API

```ts
import { createStaticGen } from '@askrjs/askr/ssg';

const ssg = createStaticGen({
  routes: [
    { path: '/', component: HomePage },
    { path: '/about', component: AboutPage },
    { path: '/blog/{slug}', component: BlogPost, params: blogPosts },
  ],
  outputDir: './dist/static',
});

const result = await ssg.generate();
console.log(result.successful, result.totalRoutes);
```

### CLI SSG

```bash
askr-cli ssg --config ./ssg.config.ts --output ./dist/static
```

### What SSG generates

- Route HTML files: `/` -> `index.html`, `/about` -> `about/index.html`
- Build metadata: `metadata.json` with per-route status, file sizes, and render durations

### Data overrides

Provide route-keyed data when components need pre-supplied values:

```ts
const ssg = createStaticGen({
  routes,
  outputDir: './dist/static',
  dataOverrides: {
    '/': { appName: 'my-site' },
  },
});
```

## See also

- [SSR guide](../guides/ssr.md)
- [SSG guide](../guides/ssg.md)
- [Runtime](./runtime.md)
- [Routing](./routing.md)
- [CLI workflows](https://github.com/askrjs/askr-cli/tree/main/docs/workflows.md)
