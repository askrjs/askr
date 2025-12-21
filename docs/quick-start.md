# Quick Start — Minimal Router App 🚀

A short, copy-paste friendly guide to get an Askr app running with a few routes and a parameterized route.

> This guide uses the polymorphic `route()` API: use `route(path, handler)` to register routes at module-load time, and `route()` (no args) to access a render-time snapshot.

---

## 1) Setup

### TypeScript (JSX)

Add this to your `tsconfig.json` so TypeScript uses Askr's JSX runtime:

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@askrjs/askr"
  }
}
```

### Vite (zero-config)

If you're using Vite, Askr ships a small plugin that makes JSX work with no extra config: it applies an esbuild transform and injects Askr's JSX runtime so you can write `class` in JSX and avoid any React-related aliases.

Make sure your `tsconfig.json` is set to use `jsx: "preserve"` and `jsxImportSource: "@askrjs/askr"` so the plugin's transform behaves as expected (example shown below):

```json
{
  "compilerOptions": {
    "jsx": "preserve",
    "jsxImportSource": "@askrjs/askr"
  }
}
```

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import { askr } from '@askrjs/askr/vite';

export default defineConfig({
  plugins: [askr()], // handles esbuild transform & injection
});
```

If you prefer TypeScript to perform the transform at compile-time (no runtime transform step), set `jsx: "react-jsx"` with `jsxImportSource: "@askrjs/askr"` in `tsconfig.json`. Both approaches work; using the plugin is the simplest for Vite projects.

### Minimal HTML

`index.html`

```html
<!doctype html>
<html>
  <body>
    <div id="app"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

---

## 2) Tiny example app (copy-paste)

`src/main.tsx`

```ts
import { createSPA, getRoutes, Link, state, navigate, route } from '@askrjs/askr';

function Home() {
  const count = state(0);
  return (
    <div style="padding:12px">
      <h1>Home</h1>
      <p>Count: {count()}</p>
      <button onClick={() => count.set(count() + 1)}>Increment</button>
      <div style="margin-top:12px">
        <Link href="/about">About</Link>
        {' · '}
        <Link href="/users/42">User 42</Link>
      </div>
    </div>
  );
}

function About() {
  return (
    <div style="padding:12px">
      <h1>About</h1>
      <Link href="/">← Home</Link>
    </div>
  );
}

function User({ id }: { id: string }) {
  return (
    <div style="padding:12px">
      <h1>User {id}</h1>
      <Link href="/">← Home</Link>
    </div>
  );
}

// Register routes (module-load time)
route('/', () => <Home />);
route('/about', () => <About />);
route('/users/{id}', ({ id }: Record<string, string>) => <User id={id} />);

// Mount app and resolve initial route
createSPA({ root: '#app', routes: getRoutes() });
navigate(window.location.pathname);
```

**Notes:**

- Route handlers receive `params` for path parameters: `({ id }) => ...`.
- Handlers may be synchronous or async; the router provides an AbortSignal (see Async routes below).

---

## 3) Async routes (short)

- The router **awaits async handlers** or async render factories; the previous UI remains mounted until the new route commits.
- **Cancellation & ordering:** handlers receive `{ signal }` (and `getSignal()` is available during render). Abort or ignore work when the signal is aborted so stale navigations don't commit.
- **Tip:** pass the signal into fetches (e.g. `fetch(url, { signal })`) or return a small synchronous fallback UI while awaiting.

Example:

```ts
route('/user/{id}', async (params, { signal }) => {
  const data = await fetch(`/api/users/${params.id}`, { signal }).then(r => r.json());
  return <User data={data} />;
});
```

---

## 4) `layout()` helper (brief)

`layout()` returns a wrapper factory to preserve layout DOM between routes:

```ts
const parent = layout(ParentLayout);
route('/parent', () => parent(<Parent />));
```

Use this when you want an explicit parent layout to stay mounted across child navigations.

---

## 5) The Router Story (v1) — short

- **Idea:** routing selects a VNode tree — nothing more.
- **Public surface:** `route(path, handler)` and `navigate(path)`.
- **Guarantees:** one route active at a time; deterministic matching (longest match wins); one atomic commit per navigation; layouts are explicit composition.

This minimal, composable core is easy to explain, test, and extend.

---

## 6) Checklist & dev

- Add `jsxImportSource: "@askrjs/askr"` to `tsconfig.json` ✅
- Register routes at module load time with `route(...)` ✅
- Use `Link` for client navigation and `navigate()` for programmatic navigation ✅
- Only call `route()` inside route handlers or render functions ✅
- Handlers must be functions that return VNodes (e.g. `() => <Page />`); do not register raw VNodes at module load time ⚠️
- Route registrations should happen before `createApp()` (registration is locked after startup) ⚠️

Run locally:

```
npm install
npm run dev
```

---

## 7) Extras & next steps

- For SSR, call `setServerLocation(url)` on the server so route snapshots match the client for hydration.
- Want a runnable Vite example or a short README? I can add an `examples/` directory with an end-to-end starter.

---

If you'd like, I can also:

- Add a short `Link` accessibility example (aria-current/data-active) and unit tests ✅
- Add a Vite lazy-loading snippet using `import.meta.glob` and prefetch tips ✨

---

_This quick start keeps the core small so your routing logic stays explicit and testable._

- `route()` with no args → render-time snapshot accessor
- `route(path, handler)` → registers a route handler

2. **Paths are typically absolute for top-level registrations**
   - Register grouped routes by using explicit absolute paths with `route()`; descriptor-style helpers are discouraged.

3. **Nesting is structural (explicit paths)**
   - Prefer explicit absolute registrations with `route()` for grouped trees.

4. **Dynamic by design**
   - Routes can be registered at runtime

5. **No name collisions**
   - `route()` (no args) returns a render-time snapshot

---

## Usage examples

### Simple

```ts
route("/", <Home />);
route("/pages", <List />);
route("/pages/{id}", ({ id }) => <Detail id={id} />);
```

### Grouped

```ts
// Register grouped routes explicitly using `route()`
route('/pages', <List />);
route('/pages/{id}', ({ id }: Record<string,string>) => <Detail id={id} />);
```

### Deep

```ts
// Register deep structures explicitly using `route()`
route('/admin', <Admin />);
route('/admin/users', <Users />);
route('/admin/users/{id}', <UserDetail />);
route('/admin/audit', <Audit />);
```

---

## Component-side access (locked)

```ts
const r = route();
```

- Read-only, reactive route binding
- Scoped to the current render
- No hooks, no globals, SSR-safe

---

## What this avoids (by design)

- ❌ relative-path DSLs
- ❌ builder/accessor name collisions
- ❌ `use*` APIs
- ❌ implicit props
- ❌ multiple registration modes

---

### One-sentence invariant

> **`route(path, handler)` defines structure; `route()` (no args) exposes live state.**

This gives you a router that’s **powerful, boring, and hard to misuse** — exactly what you want.
