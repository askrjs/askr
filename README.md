# Askr

> **Askr exists to disappear.**

Askr is a deterministic frontend runtime for humans who are no longer the only authors.

If you can write TypeScript functions and basic HTML, you already know Askr.

- **Write normal code.** Control flow is JavaScript.
- **Let the runtime handle time.** Async, routing, rendering, SSR/hydration, and cleanup are runtime responsibilities.
- **Use platform primitives.** Cancellation is `AbortController`/`AbortSignal`, not a framework invention.

Quick links:

- [docs/quick-start.md](docs/quick-start.md)
- [tests/README.md](tests/README.md)

## Our North Star

> **Write normal code. Let the runtime handle time.**

Askr exists to remove framework-shaped thinking from application code.
Async, routing, rendering, SSR, hydration, and cleanup are _runtime responsibilities_.
Developers should only think about:

- functions
- state
- HTML

## Quick start (tiny)

Install:

```sh
npm i @askrjs/askr
```

TypeScript JSX setup (`tsconfig.json`):

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@askrjs/askr"
  }
}
```

Tiny app (routing + state):

```ts
import { createSPA, getRoutes, Link, navigate, route, state } from '@askrjs/askr';

function Home() {
  const count = state(0);
  return (
    <div>
      <h1>Home</h1>
      <p>Count: {count()}</p>
      <button onClick={() => count.set(count() + 1)}>Increment</button>
      <p>
        <Link href="/users/42">User 42</Link>
      </p>
    </div>
  );
}

function User({ id }: { id: string }) {
  return (
    <div>
      <h1>User {id}</h1>
      <Link href="/">Back</Link>
    </div>
  );
}

// Register routes at module-load time
route('/', () => <Home />);
route('/users/{id}', ({ id }) => <User id={id} />);

// App root component — render `Home` by default; registered routes will take over on navigation
function App() {
  // Default page when app loads
  return <Home />;
}

// Create the app. Click the "User 42" link above to navigate to `/users/42`.
createSPA({ root: 'app', routes: getRoutes() });
```

Note: `root` is an element id string (or an `Element`).

## JSX runtime

- Exported subpath: `@askrjs/askr/jsx-runtime` (re-exports `jsx`, `jsxs`, and `Fragment`).
- For TypeScript projects, set `jsxImportSource` to `@askrjs/askr` (or `@askrjs/askr/jsx-runtime`) in `tsconfig.json` to ensure the automatic JSX transform resolves to this runtime.

- Use `class` in JSX attributes (e.g., `<div class="x">`) — the runtime accepts `class` and maps it to the element class name during rendering instead of `className`.

### Vite support ✅

If you want Vite to work with Askr without extra config, install the plugin and add it to your `vite.config.ts`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { askrVitePlugin } from '@askrjs/askr/vite';

export default defineConfig({
  plugins: [askrVitePlugin()],
});
```

The plugin configures esbuild to inject Askr's JSX runtime and adds the runtime to `optimizeDeps`.

By default the plugin also enables a small built-in JSX transform (esbuild-based) that rewrites `.jsx`/`.tsx` files to use Askr's automatic JSX runtime. This means you don't need an external JSX plugin to get JSX working and the plugin avoids adding dependencies that reference other frameworks. If you prefer to use your own toolchain, disable it with:

```ts
askrVitePlugin({ transformJsx: false });
```

We believe the best frameworks are the ones you stop thinking about.

## Cancellation is not a feature

Askr doesn’t introduce a new cancellation concept.
When work becomes stale (unmount, route replacement), the runtime aborts an `AbortController`.
You forward the provided `signal` into normal APIs:

```ts
import { route } from '@askrjs/askr';

route('/user/{id}', async (params, ctx) => {
  const user = await fetch(`/api/users/${params.id}`, {
    signal: ctx?.signal,
  }).then((r) => r.json());
  return <pre>{JSON.stringify(user, null, 2)}</pre>;
});
```

## Principles

### 1. Invisibility over Power

If the framework introduces a new mental model, it has failed.

Askr does not teach:

- lifecycles
- effects
- reactivity graphs
- schedulers

Askr teaches nothing.

### 2. JavaScript Is the Control Flow

Conditionals, loops, early returns, and `async/await` are sufficient.

We do not replace JavaScript with framework constructs.
If JS already expresses it clearly, we do not wrap it.

### 3. Determinism by Construction

Every state change has a cause.
Every render has a reason.

Askr enforces:

- serialized state transitions
- structured async
- deterministic rendering

Not by convention — by architecture.

### 4. Async Is Foundational, Not a Feature

Async is not an add-on.
It is the default.

`await` suspends execution.
Unmount cancels work.
No effects. No heuristics.

### 5. No Virtual DOM

Virtual DOM diffing compensates for non-determinism.
Askr removes the need for it.

We prefer:

- direct DOM ownership
- minimal mutation
- compiler assistance where useful

### 6. Ownership, Not Effects

Imperative code exists.
When it does, it must have an owner.

Askr provides structural hooks for:

- mount
- update
- cleanup

These hooks describe **ownership**, not reactivity.

### 7. SSR Is Normal Execution

Server rendering runs the same code as the client.
Hydration restores state — it does not guess.

No replays.
No warnings.
No mismatches.

### 8. Routing Is Explicit

URLs are not files.
Routes are functions.

Askr favors explicit, refactor-safe routing over conventions that break over time.

### 9. Components Are Not the Framework

Askr ships no UI components.

Components are userland.
Design systems evolve.
Runtimes should not.

### 10. Ergonomics Beat Flexibility

Askr optimizes for tired developers.

If something only works when you remember rules, it is broken.
The right thing must be the easiest thing.

---

## Routing: `route()` (render-time accessor) 🔧

Askr exposes a synchronous, deterministic, read-only render-time route accessor:

- `route()` — can only be called during component render and returns a deeply frozen `RouteSnapshot` with:
  - `path` (string)
  - `params` (readonly record of path params)
  - `query` (readonly helper with `get`, `getAll`, `has`, and `toJSON`)
  - `hash` (string | null)
  - `matches` (array of matching route patterns with params)

Invariants:

- `route()` throws if called outside render
- Snapshot is stable and deeply immutable for the duration of the render
- No subscriptions, no async reads, and works in SSR/hydration when `setServerLocation()` is used on the server

Example usage:

```ts
export function User() {
  const { params } = route();
  return <h1>User {params.id}</h1>;
}
```

SSR tip: use `setServerLocation(url)` in server rendering tests to ensure server and client values match during hydration.

## What Askr Refuses to Be

- A component library
- A DSL
- A configuration framework
- A committee-designed system
- A place where opinions leak into app code

## The Promise

If you forget how Askr works,
come back months later,
and can still build an app without rereading docs —

**Askr has succeeded.**

## One Rule Above All Others

> **If it takes a meeting to decide, the answer is no.**

Askr moves forward through use, not consensus.

## Askr

Write functions.
Render HTML.
Ship software.

Everything else is noise.
