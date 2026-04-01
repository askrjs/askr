# {{appName}}

Server-rendered app built with Askr, askr-ui, askr-themes, and Express.

## Commands

```bash
npm run dev        # Express dev server with Vite middleware
npm run build      # Client build + SSR build + server compile
npm run preview    # Serve production build
npm test           # Vitest (jsdom)
npm run type-check # tsc --noEmit
npm run lint       # ESLint (includes server.ts)
npm run fmt        # Prettier
```

## Architecture

- **Framework:** Askr — actor-backed, fine-grained reactive UI. No virtual DOM.
- **SSR flow:** `server.ts` (Express) loads `src/entry-server.tsx` which calls `renderToString()`. The rendered HTML is injected into `index.html` at `<!--ssr-outlet-->`. Client hydration happens via `src/main.tsx` using `hydrateSPA()`.
- **Components:** askr-ui headless components. Props use `onPress` (not `onClick`), `asChild` for polymorphism, `data-slot` attributes for styling hooks.
- **Styling:** askr-themes CSS via `[data-slot]` selectors. Design tokens use `--ak-*` prefix. Theme import in `src/styles.css`.
- **Routing:** `registerRoutes()` composes `group()` and `route()` declarations in `src/routes.tsx`. Both server and client import the same routes file.
- **State:** `state(initial)`, `derive()`, `resource()` — same primitives as SPA. SSR renders deterministically; hydration attaches interactivity.
- **Vite plugin:** `askr()` from `@askrjs/askr-vite` handles JSX transform.

## File Structure

```
server.ts              # Express server (dev + prod)
src/
  main.tsx             # Client entry: hydrateSPA
  entry-server.tsx     # SSR entry: renderToString
  app.tsx              # Root layout with nav
  routes.tsx           # Route registration (shared client/server)
  styles.css           # Theme import + layout CSS
  components/          # Reusable components
  pages/               # Route page components
  resources/           # Async data fetchers
tests/                 # Vitest tests
```

## Conventions

- TypeScript strict mode, ESM-only
- JSX import source: `@askrjs/askr`
- `server.ts` uses top-level await; run with `--loader tsx`
- Build produces `dist/client/` (static assets) and `dist/server/` (Node SSR bundle)
- Use askr-ui components instead of raw HTML for interactive elements
- Style with `--ak-*` tokens
- Prettier + ESLint enforced
