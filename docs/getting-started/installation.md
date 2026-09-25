# Installation

## Prerequisites

- Node.js 24.15+
- npm 10+

## Install package

```bash
npm install @askrjs/askr
```

`@askrjs/auth` and `@askrjs/schema` are optional peer dependencies. Askr uses
them only for types, so an app that never uses route `auth` requirements,
schema-backed route `search`, or `defineAction()` installs and typechecks
without them. Install the one you use next to Askr:

```bash
npm install @askrjs/auth    # route and group `auth` requirements
npm install @askrjs/schema  # route `search` schemas and page actions
```

Until a peer is installed, only the types Askr re-uses from it
(`AuthContext`, `AuthRequirement`, `ObjectSchema`, `InferSchema`) are `any`.
Askr's own types stay exact: route params, destinations built with `to()`,
and the search values of routes without a `search` schema are still checked.

## Configure TypeScript JSX

Use Askr's JSX runtime in `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@askrjs/askr"
  }
}
```

## Configure Vite (optional)

If you use Vite, add the Askr plugin:

```ts
import { defineConfig } from 'vite';
import { askr } from '@askrjs/vite';

export default defineConfig({
  plugins: [askr()],
});
```

## Next

- [Quick Start](quick-start.md)
- [API Overview](../reference/api.md)
