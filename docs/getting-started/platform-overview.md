# Platform Overview

Askr is organized in layers. Each layer depends on the one below it. You can stop at any layer
depending on what your application needs.

## Platform layers

```
Your Application
      ↑
  askr-cli          — generators, scaffolding, SSG runner
      ↑
  askr-themes       — optional tokens and base styles
      ↑
  askr-ui           — headless UI primitives
      ↑
  askr              — core runtime: rendering, routing, data
```

## Layer breakdown

### askr — Core runtime

The foundation of every Askr application.

Responsibilities:

- Component rendering (DOM and string)
- Application lifecycle (`createIsland`, `createSPA`, `hydrateSPA`)
- Routing: `registerRoutes()`, `group()`, `route()`, `currentRoute()`, `navigate()`, `Link`
- Reactivity: `state()`, `derive()`, `selector()`
- Async data: `resource()`, `on()`, `timer()`, `task()`
- SSR and SSG output

The runtime is the only required package. Every other package is optional.

### askr-ui — Headless UI primitives

Provides interaction behavior and accessibility patterns without imposing visual styling.

Responsibilities:

- Interaction primitives (button, input, select, dialog, etc.)
- Keyboard navigation and ARIA patterns
- Composable behavior hooks
- No styling opinions — pair with `askr-themes` or your own CSS

### askr-themes — Optional styling layer

Provides visual defaults you can use as-is or override.

Responsibilities:

- Design tokens (color, spacing, type scale, radius)
- Base component styles
- Layout utility classes

Not required. Omit this layer when you have your own design system.

### askr-lucide — Icon wrappers

Thin Askr-native wrappers around the Lucide icon set.

Responsibilities:

- Consistent icon API (size, color, accessibility)
- Tree-shakeable per-icon imports
- Integrates with `askr-ui` sizing conventions

### askr-cli — Developer workflow tooling

Provides project creation, code generation, and the SSG runner.

Responsibilities:

- `askr-cli create` — scaffold a new project from a template
- `askr-cli ssg` — run static site generation
- Feature generators (coming: `askr-cli add page`, `askr-cli add crud`)

Generated code has no runtime dependency on the CLI. Once scaffolded, the CLI
is a dev-time tool only.

## What the platform does not cover

Askr focuses on frontend application structure. The following are intentionally out of scope:

- Server-side business logic
- Authentication and session state
- API routing or middleware
- Database access
- Deployment infrastructure

## Next steps

- [Installation](./installation.md)
- [Quick start](./quick-start.md)
- [CLI overview](../cli/overview.md)
- [Package map](../reference/package-map.md)
