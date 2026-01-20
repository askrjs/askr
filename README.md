# Askr

**An AI‑first, deterministic TypeScript/JSX runtime for predictable co‑authored code.**

## Why Askr

- AI-generated code breaks when frameworks rely on hidden lifecycle, implicit scheduling, or unclear ownership.
- Askr removes ambiguity: ownership, time, and cancellation are explicit and visible in code.
- Deterministic renders and first‑class cancellation make small changes (human or AI) safe and auditable.

## What Askr is / is not

- **Is:** a tiny runtime that runs plain functions + JSX; async/await is first‑class; cancellation via AbortSignal; deterministic on client and server.
- **Is not:** a React replacement, a virtual DOM, a component library, or a runtime with hidden lifecycle heuristics.

## Quick start

1. Install:

```sh
npm install @askrjs/askr
```

2. Minimal `tsconfig.json`:

```json
{ "compilerOptions": { "jsx": "preserve", "jsxImportSource": "@askrjs/askr" } }
```

3. `src/main.tsx` (Home + User):

```ts
import { createSPA, route, getRoutes, Link, state } from '@askrjs/askr';

function Home() {
  const c = state(0);
  return (
    <div>
      <h1>Home</h1>
      <button onClick={() => c.set(x => x + 1)}>Count: {c()}</button>
      <p><Link href="/user/42">User 42</Link></p>
    </div>
  );
}

function User({ id }: { id: string }) {
  return <div><h1>User {id}</h1><Link href="/">← Back</Link></div>;
}

route('/', () => <Home />);
route('/user/{id}', ({ id }) => <User id={id} />);
createSPA({ root: 'app', routes: getRoutes() });
```

4. `index.html`:

```html
<div id="app"></div>
<script type="module" src="./src/main.tsx"></script>
```

5. Run:

```sh
npx vite
```

## Principles

- Determinism: renders have causes and are reproducible.
- Explicit ownership & cancellation: runtime aborts stale work; forward `AbortSignal` to async APIs.
- Simple primitives: plain functions + JSX + async/await are the API.
- Minimal surface & pit‑of‑success for AI: predictable, small APIs that are easy to generate correctly.
- Invariants, tests & benches: documented invariants, explicit edge‑case coverage, and performance benches — behavior is tested and measurable, not a toy.
