# Installation

## Prerequisites

- Node.js 20+
- npm 10+

## Install package

```bash
npm install @askrjs/askr
```

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
