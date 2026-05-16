# Package Map

This reference describes the published package boundaries for the Askr platform.
Use the owning package repository for package-specific implementation details.

## `@askrjs/askr`

Core runtime package.

Responsibilities:

- Component rendering and lifecycle
- App startup via `@askrjs/askr/boot`
- Routing via `@askrjs/askr/router`
- Reactivity via `state()`, `derive()`, and `selector()`
- Async resources via `@askrjs/askr/resources`
- Query and mutation state via `@askrjs/askr/data`
- UI error boundaries via `@askrjs/askr/components`
- Timing helpers via `@askrjs/askr/fx`
- JSX control flow via `@askrjs/askr/control`
- Structural foundations via `@askrjs/askr/foundations`
- Lower-level foundations via `@askrjs/askr/foundations/*`
- SSR via `@askrjs/askr/ssr`
- SSG via `@askrjs/askr/ssg`

Does not include:

- Visual themes or tokens
- CLI scaffolding
- Package-specific UI styling layers

## `@askrjs/ui`

Headless UI primitives.

Responsibilities:

- Behavior primitives for common controls
- Keyboard navigation and ARIA behavior
- Composition helpers from `@askrjs/ui/foundations`

Does not include:

- Visual styling
- Application runtime behavior
- Business logic

## `@askrjs/themes`

Styling layer for Askr applications.

Responsibilities:

- Theme tokens
- Base component styles
- Layout utilities

Does not include:

- Runtime behavior
- Component logic
- CLI tooling

## `@askrjs/lucide`

Lucide icon wrappers.

Responsibilities:

- Thin icon wrappers
- Tree-shakeable icon imports

Does not include:

- Icon authoring tools
- Non-Lucide icon sets

## `@askrjs/vite`

Vite integration for Askr.

Responsibilities:

- JSX transform wiring
- Template optimization hooks
- Vite config defaults

Does not include:

- Runtime APIs
- UI components
- CLI tooling

## `@askrjs/cli`

Developer workflow tooling.

Responsibilities:

- Project creation
- Static-site generation tooling

Does not include:

- Runtime code
- UI primitives
- Application-specific business logic

## Import guidance

Prefer the package that owns the feature. Use subpaths for feature-focused imports.

```ts
import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';
import { ErrorBoundary } from '@askrjs/askr/components';
import { createQuery } from '@askrjs/askr/data';
import { route } from '@askrjs/askr/router';
import { resource } from '@askrjs/askr/resources';
import { debounce } from '@askrjs/askr/fx';
import { For, Show } from '@askrjs/askr/control';
import { layout, Slot } from '@askrjs/askr/foundations';
import {
  createCollection,
  createLayer,
} from '@askrjs/askr/foundations/structures';
import { renderToString } from '@askrjs/askr/ssr';
import { createStaticGen } from '@askrjs/askr/ssg';
```
