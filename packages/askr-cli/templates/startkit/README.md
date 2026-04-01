# {{appName}} starter kit

A production-ready Askr starter built to feel like a real product from day one.

It ships with opinionated defaults for routing boundaries, layout composition,
state handling, and interface polish so you can focus on product behavior instead
of project plumbing.

Stack:

- askr
- askr-ui
- askr-themes (default)
- lucide icons via @askrjs/askr-lucide
- plain CSS with layers and design tokens

## Quick start

```bash
npm install
npm run dev
```

Then run quality checks before your first commit:

```bash
npm run check
npm run fmt:check
```

## Command reference

```bash
npm run dev         # Local dev server with HMR
npm run build       # Production build
npm run preview     # Preview production build
npm run type-check  # TypeScript checks
npm run lint        # ESLint across project files
npm test            # Vitest suite
npm run fmt         # Format full project with Prettier
npm run fmt:check   # Verify formatting
npm run check       # type-check + lint + tests
```

## Routes and layout model

Routes are registered in src/router.tsx and split into explicit groups:

- Public routes: / (landing)
- Auth routes: /login (centered auth layout)
- Protected routes: /dashboard, /accounts, /settings (app shell layout)
- Fallback route: /\* (not found)

The root app wrapper in src/app.tsx hosts cross-cutting providers such as toast.

## Project structure

```text
src/
  app.tsx
  router.tsx

  layouts/
    app-layout.tsx
    auth-layout.tsx

  pages/
    landing.tsx
    login.tsx
    dashboard.tsx
    accounts.tsx
    settings.tsx
    not-found.tsx

  components/
    app-sidebar.tsx
    app-header.tsx
    stat-card.tsx
    data-table.tsx
    empty-state.tsx
    page-header.tsx

  features/
    accounts/
      account-table.tsx
      account-filters.tsx

  lib/
    mock-data.ts
    format.ts

  styles/
    reset.css
    tokens.css
    theme.css
    layout.css
    components.css
```

## How routing works

src/router.tsx uses `registerRoutes()`, `group()`, and `route()` to compose route groups:

- A shared root wrapper for providers
- Auth layout only for /login
- App layout only for protected routes
- Built-in auth metadata redirects unauthenticated users from protected routes to /login

This keeps route ownership clear and avoids one mega-layout for every page type.

## How layouts work

- App layout (src/layouts/app-layout.tsx): sidebar + sticky header + content area.
- Auth layout (src/layouts/auth-layout.tsx): minimal centered shell for forms.

Use app layout for authenticated product surfaces and auth layout for onboarding/login flows.

## How to add a page

1. Create a new page file in src/pages.
2. Register a route in src/router.tsx.
3. Place the route in the correct layout group (public, auth, protected).
4. If protected, apply the same `auth`, `role`, `permission`, or `policies` pattern used by existing app routes.

## First-hour customization checklist

1. Update brand name, colors, and typography tokens in src/styles/tokens.css.
2. Replace mock user/session data in src/lib/mock-data.ts.
3. Swap dashboard/account samples for domain-specific features.
4. Wire login and route auth logic to your real auth provider.
5. Replace placeholders in landing and settings copy with product language.
6. Add one end-to-end happy-path test for your primary workflow.

## How to add a component

1. Put shared UI in src/components.
2. Put domain-specific pieces in src/features/<feature-name>.
3. Keep component APIs prop-driven and small.
4. Prefer composing askr-ui primitives before inventing new abstractions.

## Styling organization

The CSS architecture is intentionally layered:

- reset.css: baseline resets
- tokens.css: design tokens (colors, spacing, type scale, radius)
- theme.css: global typography and high-level theme values
- layout.css: page/shell structure and responsive behavior
- components.css: component and slot-level styling

Guidelines:

- Use token variables for spacing and colors.
- Keep a calm neutral palette and one accent color.
- Prefer subtle borders over heavy shadows.
- Keep radius and motion restrained.

## UX patterns included

- Loading states (skeletons)
- Empty states
- Error states
- Disabled actions
- Form validation examples
- Toast example
- Modal example

## Notes

Data is intentionally mock-only and deterministic.

When integrating backend services:

1. Keep API calls and data transforms in src/lib.
2. Preserve AbortController signal forwarding in async operations.
3. Keep route guards and layout boundaries explicit in src/router.tsx.
