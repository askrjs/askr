# Package Map

Official packages in the Askr platform, their responsibilities, and their boundaries.

For the platform-level operating model and how the packages fit together, see
[Platform charter](../development/platform-charter.md).

This reference describes the intended package boundaries. Package-specific
details live in the owning package repository.

---

## `@askrjs/askr`

**Core framework runtime.**

### Responsibilities

- Component rendering (DOM patches, string rendering)
- Application lifecycle: `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`
- Routing: `registerRoutes()`, `group()`, `route()`, `currentRoute()`, `navigate()`, `Link`, `getManifest()`
- Reactivity: `state()`, `derive()`, `selector()`
- Context: `defineContext()`, `readContext()`
- Async data: `resource()`, `on()`, `timer()`, `task()`, `stream()`, `capture()`
- Timing utilities: `debounce()`, `throttle()`, `retry()`, `defer()`
- SSR output: `renderToString()` and URL-based helpers
- SSG output: `createStaticGen()`
- Event delegation
- Foundation primitives via `@askrjs/askr/foundations`:
  - structures (`Slot`, `Presence`, `Portal`, `DefaultPortal`, `createCollection`, `createLayer`, `layout`)

- Headless UI helper foundations via `@askrjs/ui/foundations`:
  - interactions (`pressable`, `hoverable`, `focusable`, `rovingFocus`, `dismissable`)
  - utilities (`composeHandlers`, `mergeProps`, `composeRefs`, `formatId`, ARIA helpers)
  - controllable state helpers

### Does not include

- Visual styling or tokens
- Project generators or CLI tools

### Import style

```ts
import { state, route, currentRoute, navigate, resource } from '@askrjs/askr';

// Explicit subpaths for feature-focused imports:
import { createSPA } from '@askrjs/askr/boot';
import { Case, For, Match, Show } from '@askrjs/askr/control';
import { registerRoutes, group, route } from '@askrjs/askr/router';
import { resource, on } from '@askrjs/askr/resources';
import { debounce } from '@askrjs/askr/fx';
import { Slot, Portal, DefaultPortal } from '@askrjs/askr/foundations';
import { pressable } from '@askrjs/ui/foundations';
import { renderToString } from '@askrjs/askr/ssr';
import { createStaticGen } from '@askrjs/askr/ssg';
```

---

## `@askrjs/ui`

**Headless UI primitives.**

### Responsibilities

- Interaction behavior for common UI patterns (button, input, select, dialog, tabs, etc.)
- Keyboard navigation
- ARIA attribute management
- Composable behavior composition via foundations

### Does not include

- Visual styling or themes
- Layout opinions
- Business logic

### Import style

```ts
import { Button } from '@askrjs/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@askrjs/ui/dialog';
import { Select, SelectTrigger, SelectContent } from '@askrjs/ui/select';
```

---

## `@askrjs/themes`

**Optional styling layer.**

### Responsibilities

- Design tokens: color, spacing, type scale, border radius, shadows
- Base component styles that pair with `askr-ui` primitives
- Layout utility classes

### Does not include

- Runtime behavior
- Component logic
- Business rules

### Import style

```ts
// Typically imported once at the app entry point or in CSS:
import '@askrjs/themes/default';
```

---

## `@askrjs/lucide`

**Lucide icon wrappers for Askr.**

### Responsibilities

- Thin wrappers around the Lucide SVG icon set
- Consistent icon API: `size`, `color`, `aria-hidden`, `title`
- Tree-shakeable per-icon and barrel imports
- Named size hooks aligned with `askr-ui` conventions

### Does not include

- Icon authoring tools
- Non-Lucide icon sets

### Import style

```ts
import { SearchIcon, XIcon, MenuIcon } from '@askrjs/lucide';

// Per-icon (better tree-shaking):
import { SearchIcon } from '@askrjs/lucide/icons/search';
```

---

## `@askrjs/vite`

**Vite integration plugin for Askr projects.**

### Responsibilities

- JSX transform wiring for Askr runtime in Vite
- Template optimization hooks used by Askr starter projects
- Vite config defaults needed for Askr runtime imports

### Does not include

- Runtime rendering or routing APIs
- UI components or themes
- CLI scaffolding

### Import style

```ts
import { askr } from '@askrjs/vite';
```

---

## `@askrjs/cli`

**Developer workflow tooling.**

### Responsibilities

- Project creation: `askr-cli create [template] <name>`
- Static site generation runner: `askr-cli ssg`
- Feature generators (planned): `add page`, `add route`, `add crud`, `add table`, `add form`

### Does not include

- Runtime code
- UI primitives or styles
- Any dependency on the generated application at runtime

Generated code has no runtime dependency on the CLI. The CLI is a dev-time tool only.

### Usage

```bash
npx @askrjs/cli --help
npx @askrjs/cli create startkit my-app
npx @askrjs/cli ssg --config ./ssg.config.ts --output ./dist/static
```

---

## See also

- [Project structure](./project-structure.md)
- [Platform overview](../getting-started/platform-overview.md)
- [API reference](./api.md)
- [CLI reference](./cli.md)
