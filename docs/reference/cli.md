# CLI Reference

The Askr CLI is the command-line surface for scaffolding projects and running static-site generation.

## Install and Run

The canonical entrypoint is `@askrjs/askr-cli`.

```bash
npx @askrjs/askr-cli --help
```

The package also exposes direct bins:

- `askr-cli`
- `askr-create`
- `askr-ssg`

## Commands

### `askr-cli create`

Scaffold a new Askr application from one of the built-in templates.

```bash
askr-cli create [template] <name> [--no-install]
```

Examples:

```bash
askr-cli create spa hello-askr
askr-cli create ssg docs-site
askr-cli create startkit acme-dashboard
askr-create ssr storefront
```

Arguments:

- `template`: one of `spa`, `ssr`, `ssg`, or `startkit`
- `name`: output directory name for the new app

Options:

- `--no-install`: scaffold files without installing dependencies
- `--help`, `-h`: show create help

If you omit the template or app name, the CLI falls back to an interactive prompt.

#### Templates

- `spa`: client-rendered app with router support
- `ssr`: server-rendered app scaffold
- `ssg`: static generation scaffold with `ssg.config.ts`
- `startkit`: fuller application starter with dashboards, auth screens, and more opinionated structure

### `askr-cli ssg`

Generate static HTML output from a TypeScript SSG config.

```bash
askr-cli ssg --config <path> --output <dir> [options]
```

Examples:

```bash
askr-cli ssg --config ./ssg.config.ts --output ./dist/static
askr-ssg --config ./examples/ssg.config.ts --output ./dist/static --incremental
```

Required options:

- `--config <path>`: path to a TypeScript config file
- `--output <dir>`: output directory for generated files

Optional options:

- `--workers <n|auto>`: preferred parallelism
- `--incremental`: enable incremental generation mode
- `--changed-key <key>`: mark an invalidation key as changed; repeatable
- `--changed-route <path>`: mark a route path as changed; repeatable
- `--force-full`: force a full rebuild even when incremental flags are present
- `--help`, `-h`: show SSG help

#### Config shape

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

## Recommended Usage Pattern

Use the unified CLI first:

```bash
npx @askrjs/askr-cli create spa my-app
npx @askrjs/askr-cli ssg --config ./ssg.config.ts --output ./dist/static
```

Use the direct bins when you want shorter commands inside an already-installed toolchain.

## Related Docs

- [Quick Start](../getting-started/quick-start.md)
- [SSG Guide](../guides/ssg.md)
- [API Overview](./api.md)
