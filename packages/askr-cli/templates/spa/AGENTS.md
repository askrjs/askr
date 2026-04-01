# {{appName}}

Client-side SPA built with Askr, askr-ui, and askr-themes.

## Commands

```bash
npm run dev        # Vite dev server with HMR (port 5173)
npm run build      # Production build to dist/
npm run preview    # Serve production build locally
npm test           # Vitest (jsdom)
npm run type-check # tsc --noEmit
npm run lint       # ESLint
npm run fmt        # Prettier
```

## Architecture

- **Framework:** Askr — actor-backed, fine-grained reactive UI. No virtual DOM.
- **Components:** askr-ui headless components (Button, Tabs, Accordion, Toggle, Input, etc.). Props use `onPress` (not `onClick`), `asChild` for polymorphism, `data-slot` attributes for styling hooks.
- **Styling:** askr-themes CSS via `[data-slot]` selectors. Design tokens use `--ak-*` prefix. Theme import in `src/styles.css`. Switch themes by changing the import (e.g., `@askrjs/askr-themes/tuxedo`).
- **Routing:** `registerRoutes()` composes `group()` and `route()` declarations in `src/routes.tsx`. Navigate with `<Link href="...">`. No config file.
- **State:** `state(initial)` creates reactive values. Read with `count()`, update with `count.set(v => v + 1)`. `derive()` for computed values. `resource()` for async data.
- **Vite plugin:** `askr()` from `@askrjs/askr-vite` handles JSX transform — no manual esbuild config needed.

## File Structure

```
src/
  main.tsx           # Entry: createSPA + navigate
  app.tsx            # Root layout with nav
  routes.tsx         # Route registration
  styles.css         # Theme import + layout CSS
  components/        # Reusable components
  pages/             # Route page components
  resources/         # Async data fetchers (resource())
tests/               # Vitest tests
```

## Conventions

- TypeScript strict mode, ESM-only
- JSX import source: `@askrjs/askr`
- Use askr-ui components instead of raw HTML for interactive elements
- Style with `--ak-*` tokens, never `--pico-*` or hardcoded colors
- Prettier + ESLint enforced
