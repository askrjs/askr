# @askrjs/askr-cli

Unified command-line interface for the Askr platform.

Canonical docs live in [docs/reference/cli.md](../../docs/reference/cli.md).

## Commands

- `askr-cli create [template] <name> [--no-install]`
- `askr-cli ssg --config <path> --output <dir> [--incremental]`

Direct command bins are also provided:

- `askr-create` (alias for scaffolding)
- `askr-ssg` (direct SSG entry)

## Templates

Supported templates for `create`:

- `spa`
- `ssr`
- `ssg`
- `startkit`

Templates are stored in `templates/`.

## Recommended Usage

```bash
npx @askrjs/askr-cli create startkit my-app
npx @askrjs/askr-cli ssg --config ./ssg.config.ts --output ./dist/static
```
