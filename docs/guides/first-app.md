# First App

A concise walkthrough for building a small Askr application from scratch.

For a shorter setup path, use the [quick start](../getting-started/quick-start.md).
For a generated starter, use `npx @askrjs/cli create startkit my-app`.

## What You Will Build

- A routed application shell
- A task list backed by `state()`
- A form for adding tasks
- Navigation between two routes

## 1. Install and Configure

Follow [Installation](../getting-started/installation.md), then configure the
Askr Vite plugin and `jsxImportSource`.

## 2. Create State-Driven UI

```tsx
import { state } from '@askrjs/askr';
import { For } from '@askrjs/askr/control';

export function TaskList() {
  const [tasks, setTasks] = state(['Write docs']);
  const [title, setTitle] = state('');

  const addTask = () => {
    const next = title().trim();
    if (!next) return;
    setTasks((current) => [...current, next]);
    setTitle('');
  };

  return (
    <section>
      <input
        value={title()}
        onInput={(event: Event) =>
          setTitle((event.target as HTMLInputElement).value)
        }
      />
      <button onClick={addTask}>Add task</button>
      <ul>
        <For each={tasks()} byIndex={true}>
          {(task) => <li>{task}</li>}
        </For>
      </ul>
    </section>
  );
}
```

## 3. Add Routes

```tsx
import { createSPA } from '@askrjs/askr/boot';
import { getManifest, registerRoutes, route } from '@askrjs/askr/router';
import { TaskList } from './task-list';

function About() {
  return <p>Built with Askr.</p>;
}

registerRoutes(() => {
  route('/', TaskList);
  route('/about', About);
});

await createSPA({
  root: '#app',
  manifest: getManifest(),
});
```

## Common Pitfalls

- Register routes before calling `createSPA()`.
- Keep route handlers synchronous; use `resource()` inside components for async data.
- Use `cleanupApp(root)` in tests when a mounted app must be torn down.

## See Also

- [Core: runtime](../core/runtime.md)
- [Core: routing](../core/routing.md)
- [Core: data](../core/data.md)
