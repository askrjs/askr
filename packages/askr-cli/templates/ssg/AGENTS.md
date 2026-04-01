# {{appName}}

Static site built with Askr, askr-ui, askr-themes, and createStaticGen.

## Commands

```bash
npm run dev        # Vite dev server (runs as SPA for development)
npm run build      # Production client build to dist/
npm run generate   # Pre-render all routes as static HTML to dist/static/
npm run preview    # Serve production build locally
npm test           # Vitest (jsdom)
npm run type-check # tsc --noEmit
npm run lint       # ESLint
npm run fmt        # Prettier
```

## Architecture

- **Framework:** Askr — actor-backed, fine-grained reactive UI. No virtual DOM.
- **SSG flow:** `ssg.config.ts` defines routes. `ssg-build.ts` imports the config and calls `createStaticGen()` to render each route to static HTML at build time. Dev mode uses `createSPA()` for a normal SPA experience.
- **Components:** askr-ui headless components. Props use `onPress` (not `onClick`), `asChild` for polymorphism, `data-slot` attributes for styling hooks.
- **Styling:** askr-themes CSS via `[data-slot]` selectors. Design tokens use `--ak-*` prefix. Theme import in `src/styles.css`.
- **Routing:** `registerRoutes()`, `group()`, and `route()` in `src/routes.tsx` for dev SPA mode. `ssg.config.ts` defines the same routes for static generation using `RouteConfig[]`.
- **State:** `state(initial)`, `derive()`, `resource()`. Static generation renders components synchronously; interactive state works at runtime in the browser.
- **Vite plugin:** `askr()` from `@askrjs/askr-vite` handles JSX transform.

## File Structure

```
ssg.config.ts          # Route definitions for static generation
ssg-build.ts           # Build script: calls createStaticGen
src/
  main.tsx             # Client entry: createSPA (dev mode)
  app.tsx              # Root layout with nav
  routes.tsx           # Route registration (dev SPA mode)
  styles.css           # Theme import + layout CSS
  components/          # Reusable components
  pages/               # Route page components
  resources/           # Async data fetchers
tests/                 # Vitest tests
```

## Conventions

- TypeScript strict mode, ESM-only
- JSX import source: `@askrjs/askr`
- Add new pages in `src/pages/`, register in both `src/routes.tsx` and `ssg.config.ts`
- Use askr-ui components instead of raw HTML for interactive elements
- Style with `--ak-*` tokens
- Prettier + ESLint enforced
