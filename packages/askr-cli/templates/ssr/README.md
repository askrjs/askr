# {{appName}} - SSR Template

A Server-Side Rendered application built with **Askr**, **Vite**, **Express**, and **TypeScript**.

## Quick Start

```bash
npm install
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Build client and server
npm run preview  # Run production build
npm test         # Run tests with Vitest
```

## Project Structure

```
src/
├── main.tsx         # Client entry - hydration
├── app.tsx          # Root component
├── routes.tsx       # Route registration with route()
├── styles.css       # Global styles
├── components/      # Reusable components (Counter, etc)
├── pages/           # Page components (Home, About)
├── resources/       # Async data fetching with resource()
└── tests/           # Test files

server.ts           # Express server
vite.config.ts      # Vite config (client)
vitest.config.ts    # Vitest config
```

## How SSR Works

### The Rendering Flow

```
1. Browser requests /about
   ↓
2. Express receives GET /about
   ↓
3. Server calls renderToString(<App />)
   ↓
4. setServerLocation('/about') makes currentRoute() return /about
   ↓
5. Router component renders matching page
   ↓
6. HTML string returned to browser
   ↓
7. Browser displays pre-rendered content immediately (fast!)
   ↓
8. JavaScript bundle loads in background
   ↓
9. hydrateSPA() attaches interactivity to existing DOM
   ↓
10. Buttons, forms, etc become interactive
```

### Key Benefits

- **Fast Initial Load**: HTML in browser immediately (no JS required)
- **SEO**: Search engines see fully-rendered HTML
- **Progressive Enhancement**: Content visible before JS loads
- **Same Code**: Server and client run identical component code

## Core Concepts

### Server-Side Rendering

In `server.ts`, render the app on each request:

```tsx
app.get('*', async (req, res) => {
  setServerLocation(req.url); // Tell currentRoute() the current URL

  const html = await renderToString(
    <html>
      <body>
        <div id="app">
          <App />
        </div>
        <script type="module" src="/main.tsx"></script>
      </body>
    </html>,
    { routes: getRoutes() }
  );

  res.send('<!DOCTYPE html>' + html);
});
```

### Client-Side Hydration

In `src/main.tsx`, hydrate the pre-rendered HTML:

```tsx
import { hydrateSPA, getRoutes } from '@askrjs/askr';

hydrateSPA({
  root: 'app',
  routes: getRoutes(),
});
```

This **attaches** to existing DOM instead of creating new DOM.

### Routing

Same as SPA - declarative route registration:

```tsx
import { route } from '@askrjs/askr';

route('/', () => <Home />);
route('/about', () => <About />);
route('/users/{id}', ({ id }) => <UserDetail id={id} />);
```

Read current route with `currentRoute()`:

```tsx
function Page() {
  const routeSnapshot = currentRoute();
  return <h1>{routeSnapshot.path}</h1>;
}
```

### State

Same as SPA:

```tsx
import { state } from '@askrjs/askr';

function Counter() {
  const count = state(0); // Works on server AND client

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => count.set((c) => c + 1)}>+</button>
    </div>
  );
}
```

### Async Data

`resource()` works differently on server vs client:

**On Server:**

- Async functions throw (no `await` in SSR)
- Use `fetch('/api/...')` directly for server data
- Pass data via props or context

**On Client:**

- Async functions work normally
- Can use `resource()` for dynamic loading

Example - fetch on server, pass to client:

```tsx
// server.ts
app.get('*', async (req, res) => {
  const user = await fetch('/api/user').then((r) => r.json());

  const html = await renderToString(
    <App user={user} /> // Pass pre-fetched data
  );

  res.send('<!DOCTYPE html>' + html);
});
```

## Development Commands

```bash
npm run dev          # Start Express server with HMR
npm run build        # Build client to dist/client/ and server to dist/server.js
npm run preview      # Run production build locally
npm run type-check   # Run TypeScript type checking
npm run lint         # Check code with ESLint
npm run lint:fix     # Auto-fix linting issues
npm run fmt          # Format code with Prettier
npm test             # Run tests
npm test -- --watch  # Watch mode
npm test -- --ui     # Visual test dashboard
```

## Building for Production

```bash
npm run build    # Creates dist/client and dist/server.js
npm run preview  # Test production build locally (port 3000)
```

Deploy to Node.js hosting:

- **Heroku** - Connect GitHub, auto-deploys
- **Railway** - Simpler than Heroku
- **DigitalOcean App Platform** - Container-based
- **AWS Elastic Beanstalk** - AWS native
- **Any VPS** - Run `node dist/server.js` on server

Environment variables:

```bash
PORT=8080 npm run preview  # Run on different port
NODE_ENV=production npm run preview
```

## Common Patterns

### Server Data Fetching

```tsx
// server.ts
app.get('*', async (req, res) => {
  const data = await fetch('/api/initial-data').then((r) => r.json());

  const html = await renderToString(<App initialData={data} />, {
    routes: getRoutes(),
  });

  res.send('<!DOCTYPE html>' + html);
});
```

### Client Data Fetching

```tsx
// src/pages/users.tsx
import { resource } from '@askrjs/askr/resources';

export default function Users() {
  const users = resource(async ({ signal }) => {
    const res = await fetch('/api/users', { signal });
    return res.json();
  }, []); // No deps = fetch once

  if (users.pending) return <div>Loading...</div>;

  return (
    <ul>
      {users.value.map((u) => (
        <li key={u.id}>{u.name}</li>
      ))}
    </ul>
  );
}
```

### Avoiding Hydration Mismatches

**Problem**: Server renders different HTML than client

**Solution**: Use `setServerLocation(url)` before server render

```tsx
// server.ts
setServerLocation(req.url); // Makes currentRoute() return correct path
const html = await renderToString(<App />);
```

This ensures server and client use same route during hydration.

## Testing

Tests use Vitest:

```bash
npm test                    # Run once
npm test -- --watch         # Watch mode
npm test -- --ui            # Visual dashboard
npm test -- --coverage      # Coverage report
```

Node environment is configured in `vitest.config.ts`.

## Next Steps

1. Read [Askr docs](https://github.com/askrjs/askr#readme)
2. Add API endpoints to `server.ts`
3. Add pages to `src/pages/`
4. Register routes in `src/routes.tsx`
5. Fetch data on server, pass to pages
6. Build and deploy!

Happy building! 🚀
