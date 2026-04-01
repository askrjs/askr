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
- **Styling:** askr-themes CSS via `[data-slot]` selectors. Keep `src/styles.css` as a thin entrypoint and organize styles in `src/styles/*` using layers (reset/tokens/theme/layout/components).
- **Routing:** `registerRoutes()` composes `group()` and `route()` declarations in `src/router.tsx`. Use `currentRoute()` inside components and navigate with `<Link href="...">`.
- **State:** Prefer `const [count, setCount] = state(initial)`. Read with `count()`, update with `setCount(v => v + 1)`. `derive()` for computed values. `resource()` for async data.
- **Data flow:** Keep sample data in `src/lib/mock-data.ts`, not inline in pages. Read async data with `resource()` and keep mock mutations in the same lib boundary.
- **Preferences:** Keep persistent appearance/session helpers in the lib boundary and initialize at app bootstrap.
- **Vite plugin:** `askr()` from `@askrjs/askr-vite` handles JSX transform — no manual esbuild config needed.

## File Structure

```
src/
  main.tsx           # Entry: createSPA + navigate
  app.tsx            # Root layout with nav
  router.tsx         # Route registration
  styles.css         # Style entrypoint
  styles/            # reset/tokens/theme/layout/components layers
  components/        # App-level reusable components
  layouts/           # app and auth route layouts
  features/          # feature-scoped UI modules
  pages/             # Route page components
  lib/               # Mock data + formatting helpers
tests/               # Vitest tests
```

## Conventions

- TypeScript strict mode, ESM-only
- JSX import source: `@askrjs/askr`
- Use askr-ui components instead of raw HTML for interactive elements
- Prefer composed components from `src/components/*` for app surfaces like panels, headers, tables, and empty states
- Style with tokens; avoid hardcoded non-theme colors in component classes
- Keep spacing on a strict rhythm: 4/8/16/24/32/48
- Keep typography to a small semantic scale (title/section/body/muted)
- Prefer subtle borders over heavy shadows or decorative effects
- Ensure consistent hover/focus-visible/disabled/empty/error treatment across components
- Prettier + ESLint enforced
