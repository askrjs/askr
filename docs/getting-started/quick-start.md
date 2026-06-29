# Quick Start

This guide gets a small Askr app running with state and routing.

If you want a generated starter instead of building the example by hand, use the [CLI docs](https://github.com/askrjs/askr-cli/tree/main/docs/README.md) and scaffold a project with `askr-cli create`.

## Prerequisites

- [Installation](installation.md)
- [CLI docs](https://github.com/askrjs/askr-cli/tree/main/docs/README.md)

## 1) Create a component

```tsx
import { state } from '@askrjs/askr';

export function Counter() {
  const [count, setCount] = state(0);

  return (
    <button onClick={() => setCount((prev) => prev + 1)}>
      Count: {count()}
    </button>
  );
}
```

## 2) Mount an island

Use islands for a single mounted component (no router).

```tsx
import { createIsland } from '@askrjs/askr/boot';
import { Counter } from './Counter';

createIsland({
  root: document.body,
  component: Counter,
});
```

## 3) Optional: add SPA routing

Use router subpath APIs when you need navigation.

```tsx
import { createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route, Link } from '@askrjs/askr/router';

function Home() {
  return (
    <div>
      <h1>Home</h1>
      <Link href="/about">About</Link>
    </div>
  );
}

function About() {
  return <h1>About</h1>;
}

const registry = createRouteRegistry(() => {
  route('/', () => <Home />);
  route('/about', () => <About />);
});

await createSPA({
  root: document.getElementById('app')!,
  registry,
});
```

`createSPA()` already mounts the current browser URL when it matches one of the provided routes. Use `navigate(path)` later for user-driven transitions.

## 4) Async data pattern

Keep route handlers synchronous. Fetch data in components using resources.

```tsx
import { resource } from '@askrjs/askr/resources';

function User({ id }: { id: string }) {
  const user = resource(
    async ({ signal }) => {
      const res = await fetch(`/api/users/${id}`, { signal });
      return res.json();
    },
    [id]
  );

  if (user.pending || !user.value) return <div>Loading...</div>;
  if (user.error) return <div>Failed to load user</div>;
  return <div>{user.value.name}</div>;
}
```

## Next

- [State Guide](../guides/state.md)
- [Router Guide](../guides/router.md)
- [Resources Guide](../guides/resources.md)
- [API Overview](../reference/api.md)
