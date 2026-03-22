# CLI: create

Scaffold a new Askr project from a template.

## Usage

```bash
askr-cli create [template] <name> [--no-install]
```

## Arguments

| Argument   | Description                                         |
| ---------- | --------------------------------------------------- |
| `template` | Template to use: `spa`, `ssr`, `ssg`, or `startkit` |
| `name`     | Output directory name for the new project           |

## Options

| Option         | Description                                        |
| -------------- | -------------------------------------------------- |
| `--no-install` | Scaffold files without installing npm dependencies |
| `--help`, `-h` | Show help                                          |

If you omit the template or name, the CLI falls back to an interactive prompt.
The default template is `startkit`.

## Templates

### `spa`

Client-rendered SPA with router support. Use this for standard interactive applications.

```bash
askr-cli create spa my-app
```

If you omit the template, you still get `startkit` by default:

```bash
askr-cli create my-app
```

### `ssr`

Server-rendered app scaffold. Use this when you need SSR at the application boundary.

```bash
askr-cli create ssr my-ssr-app
```

### `ssg`

Static site generation scaffold with a `ssg.config.ts` file pre-configured.

```bash
askr-cli create ssg my-docs-site
```

### `startkit`

Full application starter with common screens pre-built: dashboard, settings, accounts,
login. The recommended starting point for new product applications.

```bash
askr-cli create startkit my-dashboard
```

Stack included:

- `askr` — runtime
- `askr-ui` — UI primitives
- `askr-themes` — default visual layer
- `askr-lucide` — icon set

## See also

- [CLI overview](./overview.md)
- [Project structure](../reference/project-structure.md)
