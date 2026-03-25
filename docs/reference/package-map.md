# Package Map

Official packages in the Askr platform, their responsibilities, and their boundaries.

For the platform-level operating model and how the packages fit together, see
[Platform charter](../development/platform-charter.md).

This reference stays aligned with the platform contract in
[packages/askr-core/tooling/platform-contract.ts](../../packages/askr-core/tooling/platform-contract.ts),
which is the machine-readable source of truth for package roles and workspace boundaries.

---

## `@askrjs/askr`

**Core framework runtime.**

### Responsibilities

- Component rendering (DOM patches, string rendering)
- Application lifecycle: `createIsland`, `createIslands`, `createSPA`, `hydrateSPA`, `cleanupApp`
- Routing: `route()`, `layout()`, `navigate()`, `Link`, `getManifest()`
- Reactivity: `state()`, `derive()`, `selector()`
- Context: `defineContext()`, `readContext()`
- Async data: `resource()`, `on()`, `timer()`, `task()`, `stream()`, `capture()`
- Timing utilities: `debounce()`, `throttle()`, `retry()`, `defer()`
- SSR output: `renderToString()` and URL-based helpers
- SSG output: `createStaticGen()`
- Event delegation
- Foundation primitives via `@askrjs/askr/foundations`:
  - interactions (`pressable`, `hoverable`, `focusable`, `rovingFocus`, `dismissable`)
  - structures (`Slot`, `Presence`, `DefaultPortal`, `createCollection`, `createLayer`, `layout`)
  - utilities (`composeHandlers`, `mergeProps`, `composeRefs`, `formatId`, ARIA helpers)
  - controllable state helpers

### Does not include

- Visual styling or tokens
- Project generators or CLI tools

### Import style

```ts
import { state, route, navigate, resource } from '@askrjs/askr';

// Explicit subpaths for feature-focused imports:
import { createSPA } from '@askrjs/askr/boot';
import { layout, registerRoute } from '@askrjs/askr/router';
import { resource, on } from '@askrjs/askr/resources';
import { debounce } from '@askrjs/askr/fx';
import { Slot, DefaultPortal, pressable } from '@askrjs/askr/foundations';
import { renderToString } from '@askrjs/askr/ssr';
import { createStaticGen } from '@askrjs/askr/ssg';
```

---

## `@askrjs/askr-ui`

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
import { Button } from '@askrjs/askr-ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@askrjs/askr-ui/dialog';
import { Select, SelectTrigger, SelectContent } from '@askrjs/askr-ui/select';
```

---

## `@askrjs/askr-themes`

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
import '@askrjs/askr-themes/default';
```

---

## `@askrjs/askr-lucide`

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
import { Search, X, Menu } from '@askrjs/askr-lucide';

// Per-icon (better tree-shaking):
import { Search } from '@askrjs/askr-lucide/icons/search';
```

---

## `@askrjs/askr-vite`

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
import { askr } from '@askrjs/askr-vite';
```

---

## `@askrjs/askr-cli`

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
npx @askrjs/askr-cli --help
npx @askrjs/askr-cli create startkit my-app
npx @askrjs/askr-cli ssg --config ./ssg.config.ts --output ./dist/static
```

---

## See also

- [Project structure](./project-structure.md)
- [Platform overview](../getting-started/platform-overview.md)
- [API reference](./api.md)
- [CLI reference](./cli.md)
