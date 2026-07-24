# Askr

[![CI](https://github.com/askrjs/askr/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/askrjs/askr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40askrjs%2Faskr.svg)](https://www.npmjs.com/package/@askrjs/askr)

Askr is an actor-backed UI runtime for TypeScript applications.
It provides explicit reactivity, routed application startup, server-side rendering,
and static-site generation entrypoints.

## Quick Start

```ts
import { state } from '@askrjs/askr';
import { createIsland } from '@askrjs/askr/boot';

function Counter() {
  const [count, setCount] = state(0);

  return <button onClick={() => setCount((value) => value + 1)}>{count()}</button>;
}

createIsland({ root: document.body, component: Counter });
```

## What It Provides

### Runtime

`@askrjs/askr` exports the core runtime primitives: `state()`, `derive()`,
`selector()`, `defineScope()`, `readScope()`, `getSignal()`, and the JSX
runtime exports.

Public APIs prefer functions and closures over classes. Lexical ownership uses
`defineScope()` and `readScope()`; there are no compatibility aliases for the
clean-break vocabulary.

App startup, routing, async resources, data helpers, and error boundaries live
on their own subpaths.

### Explicit reactivity

State is read through getter functions and updated through setter functions.

```ts
const [count, setCount] = state(0);
console.log(count());
setCount(1);
```

### Routing and app startup

Startup belongs in `@askrjs/askr/boot`. Routing helpers live in
`@askrjs/askr/router`.

```ts
import { createSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';

const registry = createRouteRegistry(() => {
  route('/', Home);
  route('/about', About);
});

createSPA({
  root: document.body,
  registry,
});
```

### Async resources

`resource()` manages async work with cancellation support.

```ts
import { resource } from '@askrjs/askr/resources';

function Data({ id }: { id: string }) {
  const data = resource(async ({ signal }) => {
    const response = await fetch(`/api/${id}`, { signal });
    return response.json();
  }, [id]);

  if (data.pending) return <div>Loading...</div>;
  if (data.error) return <div>Failed to load</div>;
return <div>{data.value.name}</div>;
}
```

Query and mutation helpers live in `@askrjs/askr/data`.

### Developer error boundaries

`ErrorBoundary` is the opt-in boundary primitive for render-time failures. It
renders a visible fallback in development, still logs the underlying error, and
can reset when your app state changes.

```ts
import { ErrorBoundary } from '@askrjs/askr/components';

function App() {
  return (
    <ErrorBoundary fallback={<div>Something went wrong</div>}>
      <FlakyView />
    </ErrorBoundary>
  );
}
```

## Documentation

- [Documentation Index](docs/index.md)
- [Installation](docs/getting-started/installation.md)
- [Quick Start](docs/getting-started/quick-start.md)
- [State Guide](docs/guides/state.md)
- [Router Guide](docs/guides/router.md)
- [Resources Guide](docs/guides/resources.md)
- [SSG Guide](docs/guides/ssg.md)
- [Runtime Enforcement](docs/concepts/runtime-enforcement.md)
- [Determinism](docs/concepts/determinism.md)
- [API Reference](docs/reference/api.md)

## Release Notes

The published package is versioned with the repository `package.json`.
Release workflows validate the version tag before publishing.

## Install

```bash
npm install @askrjs/askr
```

## License

Apache 2.0
