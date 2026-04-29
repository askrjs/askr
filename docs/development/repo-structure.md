# Development: Repository Structure

The Askr platform is developed as a set of sibling package repositories under
the `askrjs` GitHub organization. This `askr` repository owns the core runtime
and the platform-level documentation.

For dependency configuration patterns across local package checkouts, see
[Peer Dependencies in npm Workspaces](./peer-dependencies-monorepo.md).

## Local Checkout Layout

```text
askrjs/
  askr/          - core runtime and platform docs
  askr-ui/       - headless UI primitives
  askr-themes/   - optional styling layer
  askr-lucide/   - Lucide icon wrappers
  askr-cli/      - CLI tooling and project templates
  askr-vite/     - Vite integration
  askr-charts/   - chart presentation primitives
```

Each package has its own Git history, package metadata, tests, and release
configuration.

## Package Relationships

```text
application
  depends on askr
  optionally depends on askr-ui, askr-themes, askr-lucide, and askr-charts
  uses askr-cli and askr-vite as development tooling

askr-ui, askr-themes, askr-lucide, askr-cli, askr-vite, and askr-charts
  depend on or peer-depend on askr where runtime integration is required
```

Package-specific docs live in the package repo that owns the behavior. The
`askr` docs may describe package boundaries and platform-level workflows, but
they should not duplicate package-owned references.

## CLI Templates

Scaffold templates live in the CLI repo:

```text
askr-cli/
  src/
  templates/
    spa/
    ssr/
    ssg/
    startkit/
```

## Common Scripts

Most package repos expose a small set of npm scripts:

| Script          | Purpose                         |
| --------------- | ------------------------------- |
| `npm run build` | Build package artifacts         |
| `npm test`      | Run package tests where present |
| `npm run lint`  | Run package formatting checks   |
| `npm run fmt`   | Format package files            |

Check the target repo's `package.json` for the exact script list before running
automation.

## See Also

- [Contributing](./contributing.md)
- [Release](./release.md)
