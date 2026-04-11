# CLI Overview

The `@askrjs/askr-cli` package is the command-line surface for the Askr platform.

## CLI philosophy

The CLI exists to:

- Reduce boilerplate — you describe what you want, the CLI writes the files
- Enforce conventions — generated code follows platform standards
- Standardize structure — every generated project starts from the same foundation
- Accelerate feature creation — generators produce the right files in the right places

Generated code has no runtime dependency on the CLI. Once scaffolded, the CLI is a dev-time
tool only. You can read and modify every generated file without affecting how the CLI works.

## Install and run

The canonical entrypoint is `@askrjs/askr-cli`.

```bash
npx @askrjs/askr-cli --help
```

The package also exposes direct bins:

- `askr-cli`
- `askr-create`
- `askr-ssg`

## Core commands

### Project lifecycle

```bash
askr-cli create [template] <name>   # Scaffold a new project
askr-cli ssg --config <path>        # Run static site generation
```

### Project templates

| Template   | Description                                                        |
| ---------- | ------------------------------------------------------------------ |
| `spa`      | Client-rendered app with router support                            |
| `ssr`      | Server-rendered app scaffold                                       |
| `ssg`      | Static generation scaffold with `ssg.config.ts`                    |
| `startkit` | Full application starter: dashboards, auth screens, full structure |

```bash
askr-cli create startkit my-app
askr-cli create spa my-dashboard
```

### Planned generators

These commands are on the roadmap. They will scaffold feature code into an existing project.

```bash
askr add page <name>    # Add a new route + page component
askr add route <path>   # Register a new route in the router
askr add crud <model>   # Scaffold full CRUD UI for a model
askr add table <name>   # Generate a data table component
askr add form <name>    # Generate a form component
```

Generated code follows the [conventions](../reference/conventions.md) and [project structure](../reference/project-structure.md) expected by the platform.

## See also

- [create](./create.md) — full `create` command reference
- [add](./add.md) — generator command reference
- [workflows](./workflows.md) — common CLI workflows end to end
- [CLI reference](../reference/cli.md) — full option reference
