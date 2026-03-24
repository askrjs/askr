# Development: Repository Structure

The Askr platform lives in a single monorepo at `askrjs/askr`.

**For dependency configuration patterns in npm workspaces, see [Peer Dependencies in npm Workspaces](./peer-dependencies-monorepo.md).**

## Monorepo layout

```
packages/
  askr-core/        — core runtime
  askr-ui/          — headless UI primitives
  askr-themes/      — optional styling layer
  askr-lucide/      — Lucide icon wrappers
  askr-cli/         — CLI tooling and project templates

docs/               — platform documentation (you are here)
scripts/            — monorepo maintenance scripts

package.json        — npm workspaces root
```

## Package relationships

```
application
    ↑ depends on
  askr-ui, askr-themes, askr-lucide, askr-cli (as dev dep)
    ↑ depends on
  askr (peer)

askr-ui and askr-lucide consume foundational primitives from:
  @askrjs/askr/foundations
```

All packages in `packages/` are npm workspaces. The root `package.json` manages them
via `"workspaces": ["packages/*"]`.

## CLI templates

Scaffold templates live inside the CLI package:

```
packages/askr-cli/
  src/
    bin/
      create.js
      ssg.js
      cli.js
  templates/
    spa/
    ssr/
    ssg/
    startkit/
```

## Scripts

| Script                               | Purpose                          |
| ------------------------------------ | -------------------------------- |
| `npm run build`                      | Build all packages               |
| `npm run test`                       | Test all packages                |
| `npm run lint`                       | Lint the root and all packages   |
| `npm run fmt`                        | Format all docs and scripts      |
| `node scripts/validate-monorepo.js`  | Validate workspace configuration |
| `node scripts/generate-inventory.js` | Regenerate `inventory.md`        |

## See also

- [Contributing](./contributing.md)
- [Release](./release.md)
