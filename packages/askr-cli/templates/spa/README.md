# {{appName}} - SPA Template

A Single-Page Application built with **Askr**, **Vite**, and **TypeScript**.

## Quick Start

```bash
npm install
npm run dev      # Start dev server at http://localhost:5173
npm run build    # Build for production
npm run preview  # Preview production build
npm test         # Run tests with Vitest
```

## Project Structure

```
src/
├── main.tsx         # Entry point - creates SPA
├── app.tsx          # Root component with navigation
├── routes.tsx       # Route registration with route()
├── styles.css       # Global styles
├── components/      # Reusable components (Counter, etc)
├── pages/           # Page components (Home, About)
├── resources/       # Async data fetching with resource()
└── tests/           # Test files
```

## Core Concepts

### Routing with `route()`

Routes are registered declaratively at module load time:

```tsx
// src/routes.tsx
import { route } from '@askrjs/askr';

route('/', () => <Home />);
route('/about', () => <About />);
route('/users/{id}', ({ id }) => <UserDetail userId={id} />);
```

Navigate with the `Link` component:

```tsx
import { Link } from '@askrjs/askr';

<nav>
  <Link href="/">Home</Link>
  <Link href="/about">About</Link>
</nav>;
```

### State with `state()`

Create reactive values that trigger re-renders when updated:

```tsx
import { state } from '@askrjs/askr';

function Counter() {
  const count = state(0);

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => count.set((c) => c + 1)}>Increment</button>
    </div>
  );
}
```

**Key points:**

- Call `state(initialValue)` to create a reactive value
- Call `count()` to read the current value
- Call `count.set(newValue)` or `count.set(prev => ...)` to update
- Only components that use the state re-render (fine-grained)

### Async Data with `resource()`

Fetch data in components with automatic loading/error handling:

```tsx
import { resource } from '@askrjs/askr/resources';

function UserDetail({ userId }) {
  const user = resource(
    async ({ signal }) => {
      const res = await fetch(`/api/users/${userId}`, { signal });
      return res.json();
    },
    [userId]
  ); // Re-run when userId changes

  if (user.pending) return <div>Loading...</div>;
  if (user.error) return <div>Error: {user.error.message}</div>;

  return <h1>{user.value.name}</h1>;
}
```

**Important:**

- Must be called during render
- Uses `AbortSignal` for cancellation
- Dependencies array triggers re-run when values change

## Development Commands

```bash
npm run dev          # Start Vite dev server with HMR
npm run build        # Build for production to dist/
npm run preview      # Test production build locally
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
npm run build    # Creates dist/ folder
npm run preview  # Serve dist/ locally to test
```

Deploy the `dist/` folder to any static host:

- **Netlify** - Connect GitHub repo, auto-deploys on push
- **Vercel** - Same as Netlify
- **GitHub Pages** - Works with Actions
- **AWS S3** - Static hosting
- **Cloudflare Pages** - Fast global CDN

## Common Patterns

### Controlled Inputs

```tsx
function Form() {
  const email = state('');

  return (
    <input
      value={email()}
      onInput={(e) => email.set(e.target.value)}
      type="email"
    />
  );
}
```

### Conditional Rendering

```tsx
function Page() {
  const isLoading = state(true);

  return <div>{isLoading() ? <div>Loading...</div> : <div>Content</div>}</div>;
}
```

### Derived State

```tsx
import { derive } from '@askrjs/askr';

function Total() {
  const items = state([1, 2, 3]);
  const sum = derive(() => items().reduce((a, b) => a + b, 0));

  return <p>Total: {sum}</p>;
}
```

## Testing

Tests use Vitest (Jest-compatible):

```bash
npm test                    # Run once
npm test -- --watch         # Watch mode
npm test -- --ui            # Visual dashboard
npm test -- --coverage      # Coverage report
```

## Next Steps

1. Read [Askr docs](https://github.com/askrjs/askr#readme)
2. Add pages to `src/pages/`
3. Register routes in `src/routes.tsx`
4. Use `state()` and `resource()` for data
5. Build and deploy!

Happy building! 🚀
