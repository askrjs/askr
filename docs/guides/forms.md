# Forms Guide

Patterns for building forms in Askr with `state()` and headless UI primitives.

Use local state for draft values, validate before submit, and keep API calls at
the route or feature-container boundary.

For reusable or server-rendered fields, pass a stable application-owned ID and
derive label/description associations from it. See [Stable IDs](./stable-ids.md)
for instance namespaces, keyed lists and verified hydration.

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

`action(descriptor)` allocates component state for the submission status, so
it follows the same rule as `state()`: call it during render, at the top level
of the component. Call the returned `submit(input)` from event handlers when the
interaction is deliberately client-driven. It uses the same descriptor, handler,
validation, cookies, and redirects, then processes the result and declared query
invalidations. When the outcome includes a redirect (always same-origin), a
routed app follows it through the router, as `navigate()` does: the destination
route resolves, its loaders run and the page renders in place. An island or
other unrouted code performs a full-document navigation. After an action that
changes identity, such as a sign-in, rely on the router's auth resolution
(for example `createSessionAuth()`), or submit the form natively to get a fresh
document.

A failed client-driven submission rejects, and sets `state().error`, with one
of two shapes. A 422 validation replay for the same action stays the
structured `ActionValidationError` (`kind: 'invalid'`, `values`, `issues`,
`fieldErrors`). Every other failed response becomes an `Error` whose message
carries the HTTP status, such as `Action failed (500).`. The server's value is
kept as the `Error`'s `cause`: the JSON body's `error` value when present,
otherwise the body itself (for example an RFC 7807 problem response). A
string error, or the `detail`, `message`, or `title` of that value, is
appended (`Action failed (403): You cannot edit this project.`). When the body
is not JSON (for example an HTML error page from a proxy), including on a 2xx
status, the message still reports the status and the parse failure is kept as
`cause`. A bodiless success (a 204 or 205, or an empty 2xx body) resolves
with `undefined` and still invalidates the action's declared prefixes.

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

## Client-rendered action CSRF

Without a resolver, `action()` finds the token again on every submission rather
than capturing it once at render. The first source that has a token wins:

1. the explicit `csrfToken` resolver option (below);
2. the token in the latest hydration envelope, until the session identity
   changes (login, logout or a different user) - a token is bound to the session
   it was issued for, so it is dropped then;
3. a `<meta name="csrf-token" content="...">` element, read from the document at
   each submit, so a server that rotates the token after login only has to
   update the element;
4. the cookie named by the `csrfCookie` option, URL-decoded, for example
   `action(rename, { csrfCookie: 'XSRF-TOKEN' })`. There is no default cookie
   name.

`action()` rejects options other than `csrfToken` and `csrfCookie`, and a
`csrfToken` key that is present but not a function (an `undefined` from a
lost value), so a misconfigured resolver fails at render, not at submit.

A value that is not a non-empty ASCII token is skipped. When no source has a
token, the request carries none.

A pure SPA has no server-rendered page token. Pass an explicit asynchronous
resolver to `action()` when the application obtains its token through a
same-origin server endpoint:

```tsx
const rename = action(renameProject, {
  csrfToken: async (signal) => {
    const response = await fetch('/api/action-csrf', {
      credentials: 'same-origin',
      cache: 'no-store',
      redirect: 'error',
      signal,
    });
    if (!response.ok) throw new Error('Action CSRF bootstrap failed.');
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || Array.isArray(data))
      throw new Error('Invalid action CSRF bootstrap.');
    const token = 'csrfToken' in data ? data.csrfToken : undefined;
    if (!(token === undefined || typeof token === 'string'))
      throw new Error('Invalid action CSRF bootstrap.');
    return token;
  },
});
```

The application-owned GET endpoint must issue the token for the current
session with the same secret and session identity as the action registry.
With `@askrjs/server/middleware`, use `createCsrfToken(secret, sessionId)`;
keep the secret and session ID server-side. Return only `{ csrfToken }`, use
`Cache-Control: no-store`, and do not enable cross-origin reads. An anonymous
session may return `{}`; actions that require a session still reject it.

An explicit resolver replaces the chain above. It runs for every submission and receives a signal tied to the
component and its data runtime. An undefined result omits the header and does
not reuse an SSR token. Rejection stops the mutation; there is no automatic
retry. Logout, identity replacement or component teardown aborts this opted-in
operation, and a late resolver cannot start its POST. Cancellation does not
undo a server mutation that already executed. Overlapping submissions retain
the existing last-started-wins status behavior.

The one-argument `action(descriptor)` path and native `ActionForm` continue to
use the server-rendered page token. This option does not populate framework
data, hydrate an identity or change routing.

## Common Pitfalls

- Do not fetch directly from generic input or field components.
- Do not mix controlled and uncontrolled values for the same field.
- Keep business validation outside reusable visual primitives.

## See Also

- [Core: data](../core/data.md)
- [UI: composition](https://github.com/askrjs/askr-ui/tree/main/docs/composition.md)
- [Guide: CRUD](./crud.md)
