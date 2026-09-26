# Askr

[![CI](https://github.com/askrjs/askr/actions/workflows/ci.yml/badge.svg?branch=develop)](https://github.com/askrjs/askr/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/%40askrjs%2Faskr.svg)](https://www.npmjs.com/package/@askrjs/askr)

A TypeScript UI runtime with getter-based state, fine-grained bindings,
transactional commits with rollback, and one route graph for SPA, SSR, and SSG.

## How Askr works

- **Getter-based state with automatic tracking.** `state()` gives you a getter
  and a setter. Calling the getter while a component renders subscribes that
  component; you do not list dependencies for state or `derive()`.
- **Component re-render plus fine-grained bindings.** A state change re-runs
  the components that read it. A function child or prop, such as
  `{() => count()}`, is a binding: it updates its own DOM node without
  re-running the component around it.
- **Transactional commits with rollback.** Each render is prepared and applied
  as one transaction. If a component throws or the DOM commit fails, Askr
  restores the last committed DOM, and the listeners, refs, resources, and
  subscriptions created by the failed render never become live. The error goes
  to the nearest `ErrorBoundary`, or is rethrown when no boundary catches it.
  Bindings keep showing current state across a rollback.
- **One route graph.** The registry from `createRouteRegistry()` drives browser
  navigation (`createSPA`), hydration (`hydrateSPA`), server rendering
  (`renderRouteRequest`), and static generation (`createStaticGen`).

Writes made in one event handler are batched into one scheduled render, and
queued work runs in a fixed order. See [Update ordering](docs/concepts/determinism.md)
for exactly what Askr guarantees and what it does not.

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

The tuple form above and the direct callable form below are equivalent; see
[State usage forms](#state-usage-forms) for when each is convenient.

## What It Provides

### Runtime

`@askrjs/askr` exports the core runtime primitives: `state()`, `derive()`,
`selector()`, `defineScope()`, `readScope()`, `getSignal()`, and the JSX
runtime exports.

Public APIs are mostly functions and closures. Error classes such as
`RouteDataLoadError` and `SSRDataMissingError` live on their subpaths. Runtime
construction and renderer-host extensions live on the experimental subpath.
Lexical ownership uses `defineScope()` and `readScope()`;
there are no compatibility aliases for the clean-break vocabulary.

App startup, routing, async resources, data helpers, and error boundaries live
on their own subpaths.

### Getter-based state

State is read through getter functions and updated through setter functions.
Reads are explicit calls, but dependency tracking is automatic: a component
re-renders when state it read during its last committed render changes.

`state()`, `derive()`, `selector()`, `resource()`, and the other render-scoped
primitives are hooks in the React sense. Each call is matched to its slot by
call position, so call them unconditionally and in the same order on every
render; the runtime throws when the order changes (see
[Runtime Enforcement](docs/concepts/runtime-enforcement.md)). `resource()`
takes a dependency array that decides when its loader re-runs.

#### State usage forms

`state()` returns one callable state cell that is also iterable. Destructuring
it gives the cell as the getter and its `.set()` method as the setter. Call
`state()` inside a component function:

```tsx
const [count, setCount] = state(0);
console.log(count());
setCount(1);
```

The same state can be kept as one value and updated through `.set()`:

```ts
const count = state(0);
console.log(count());
count.set(1);
```

Prefer destructuring when local getter and setter names make event handlers
clear. Prefer the direct form when passing the state cell around as one value or
when keeping reads and writes under one name. Both forms have the same tracking,
scheduling, and update semantics.

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

`@askrjs/askr/data` is the canonical entrypoint for all query, mutation,
invalidation, and data-runtime helpers. The root package retains query creation
and collection, definition and serving, prefetch, and hydration exports for
compatibility with existing applications. Mutation, invalidation, and
data-runtime control remain subpath-only. New code should import the whole data surface from
`@askrjs/askr/data` rather than split related imports across entrypoints.

### Developer error boundaries

`ErrorBoundary` is the opt-in boundary primitive for render-time failures. It
renders a visible fallback in every environment (with error details expanded
by default in development), still logs the underlying error, and can reset via
a `resetKey` tied to your app state. The boundary protects both initial mount
and scheduled post-mount updates. Portal content follows its logical writer
boundary and can also recover through a boundary around its host.

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
- [Update Ordering](docs/concepts/determinism.md)
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
