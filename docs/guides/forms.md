# Forms Guide

Patterns for building forms in Askr with `state()` and headless UI primitives.

Use local state for draft values, validate before submit, and keep API calls at
the route or feature-container boundary.

## Typical Form Structure

```tsx
import { state } from '@askrjs/askr';

export function SettingsForm() {
  const [name, setName] = state('');
  const [error, setError] = state('');

  const submit = () => {
    if (!name().trim()) {
      setError('Name is required.');
      return;
    }

    setError('');
    // Submit at the route or feature boundary.
  };

  return (
    <form>
      <label htmlFor="name">Full name</label>
      <input
        id="name"
        value={name()}
        onInput={(event: Event) =>
          setName((event.target as HTMLInputElement).value)
        }
      />
      {error() ? <p role="alert">{error()}</p> : null}
      <button type="button" onClick={submit}>
        Save
      </button>
    </form>
  );
}
```

## Validation

- Validate required fields before submit.
- Store field-level errors close to the form that renders them.
- Use `role="alert"` for submit-blocking errors that need announcement.

## Declared page actions

Use a browser-safe action descriptor for forms that must work with and without
JavaScript. The server composition root registers the handler; the matched
route authorizes the descriptor.

```tsx
import { ActionForm, action, defineAction } from '@askrjs/askr/actions';
import { schema } from '@askrjs/schema';

export const renameProject = defineAction({
  id: 'rename-project',
  input: schema.object({ name: schema.string({ minLength: 2 }) }),
  invalidates: ['projects'],
});

function RenameProjectForm() {
  const rename = action(renameProject);
  return (
    <ActionForm action={renameProject}>
      <label htmlFor="project-name">Project name</label>
      <input id="project-name" name="name" />
      <button type="submit" disabled={rename.state().pending}>
        Save
      </button>
    </ActionForm>
  );
}
```

`ActionForm` is native and server-driven: it emits POST fields for action
identity and the page's CSRF token, succeeds through a validated 303 redirect,
and re-renders validation failures with submitted values and field errors at 422. It is not intercepted automatically.

Call `action().submit(input)` when the interaction is deliberately
client-driven. It uses the same descriptor, handler, validation, cookies, and
redirects, then processes the result and declared query invalidations. When the
outcome includes a redirect, it performs full-document navigation so cookies,
authentication, loaders, and SSR state all refresh together.

Overlapping client-driven submissions use last-started-wins state semantics,
including when the first submission's pending state rerenders the component.
An older request still settles for its direct caller, but it cannot replace the
newer result or error, invalidate queries, or navigate after a newer submission
has started from a rerendered `action()` command.

The default CSRF session comes from authenticated session state. Login and
other pre-authentication forms need a custom server-side CSRF `sessionId`
strategy. Protocol callbacks such as a SAML ACS should remain protocol routes,
because an identity provider posts a protocol response rather than an Askr
action submission.

## Common Pitfalls

- Do not fetch directly from generic input or field components.
- Do not mix controlled and uncontrolled values for the same field.
- Keep business validation outside reusable visual primitives.

## See Also

- [Core: data](../core/data.md)
- [UI: composition](https://github.com/askrjs/askr-ui/tree/main/docs/composition.md)
- [Guide: CRUD](./crud.md)
