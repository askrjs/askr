# Provider-session client binding

`createSessionAuth` at `@askrjs/askr/router` binds a routed browser app to the
same-origin provider-session routes owned by `@askrjs/server`. The browser
receives an identity snapshot; provider tokens and refresh-token rotation remain
on the server. Configure the provider engine on the server separately.

```tsx
import { requireUser } from '@askrjs/auth';
import { createSPA } from '@askrjs/askr/boot';
import {
  createRouteRegistry,
  createSessionAuth,
  currentAuth,
  route,
} from '@askrjs/askr/router';

const auth = createSessionAuth({ loginPath: '/login' });
const registry = createRouteRegistry(
  () => {
    route('/account', () => <main>{currentAuth().principal?.id}</main>, {
      auth: requireUser(),
    });
    route('/login', () => (
      <a href={auth.loginHref('microsoft', { returnTo: '/account' })}>
        Sign in with Microsoft
      </a>
    ));
  },
  { auth }
);

await createSPA({ root: '#app', registry });
```

Pass the factory's exact returned object to the registry or to the boot `auth`
option. Each opted-in routed root owns a dedicated isolated data runtime; omit
`dataRuntime`. This initial contract rejects shared/custom data runtimes and
external `replaceDataRuntime()` calls on those roots. Manual router auth and
its application-owned runtime remain available independently.

## Hydration and reactive identity

Use the same binding in the server route registry and pass the server's resolved
request identity to SSR. The binding's `dehydrate` callback constructs only
`authenticated`, `principal: { id, subject? } | null`, `tenant` and a sorted unique
`scopes` array. It omits sessions, tokens, roles, permissions and arbitrary
provider claims. `hydrateSPA()` adopts that snapshot without an extra initial
`GET /auth/session`; later same-page navigations share the cached identity.

The browser uses a deeply frozen projection. `currentAuth()` inside a routed
component reads that root's binding reactively; a server render reads its own
request context. Resource/API scopes are never flattened into this identity
snapshot. Provider mode exposes validated identity/authentication scopes only;
role and permission predicates deny absent application grants. Applications
that own additional authorization data use the manual auth mode deliberately.

Without an SSR snapshot, provider hydration discards unowned SSR markup/query
data and starts a fresh SPA. The first route resolution requests `/auth/session`
with same-origin credentials, `cache: 'no-store'` and no redirect following.
Concurrent resolutions share one GET. Cancelling one caller does not cancel
other callers; session retirement aborts the shared operation and fences even a
transport that ignores cancellation. An older GET or SSR seed cannot overwrite
a newer live identity.

## Logout and identity changes

`await auth.logout()` sends `POST /auth/logout` with JSON `{}` and same-origin
credentials. It retires that binding's private route DOM, component lifetimes,
query/mutation work and retained data handles before waiting for the response.
It then resolves the current route as anonymous, preserving the return target
through the configured login page. Logout is local; provider logout and
revocation are explicit server actions.

Cross-tab messages contain only invalidation hints. They immediately retire
local private state, then revalidate the current server authority. A delayed
logout message cannot install an old anonymous snapshot over a newer login.
BroadcastChannel is preferred, with storage/focus fallback. Persisted `pageshow`
and hidden-to-visible transitions also revalidate after potentially missed hints;
initial page display does not trigger an extra hydration GET. A page binding
announces its presence once; cancelled initial boots do not rebroadcast on every
restart. Root teardown removes its listeners and retires its owned runtime.

The ownership fence begins before initial auth, route loaders and metadata. A
session change cancels that boot and restarts against current authority; stale
loader, metadata and delayed hydration continuations cannot publish private
markup or head nodes. A stale, unmounted SSR page loses its private markup and
query data before the replacement SPA starts.
A malformed provider snapshot also discards unmounted SSR markup and its query
payload before hydration rejects.

## API requests and interaction recovery

API transports keep ownership of their native response bodies, cancellation and
errors. Pass an already-decoded HTTP 401 interaction problem or an
`@askrjs/fetch` result/FetchError to `auth.handleAuthFailure()`. The binding does
not wrap API fetch calls, clone responses or retry requests. Its optional
`SessionAuthOptions.fetch` only injects the session/logout transport.

```ts
import { createFetch, json } from '@askrjs/fetch';

const api = createFetch();
const result = await api({
  url: '/api/profile',
  signal,
  response: json(),
  errors: { 401: json() },
});
if (!result.ok) auth.handleAuthFailure(result);
```

`auth.handleAuthFailure(failure)` accepts a decoded interaction problem or
an `@askrjs/fetch` HTTP-401 result/FetchError. Other status codes and network,
abort, decoding or unrelated failures keep their ordinary behavior. A route
loader's typed interaction error follows the same recovery path, including a
`lazyRouteData()` wrapper. Login recovery goes to the configured application
login page with `next`; consent recovery constructs the known server provider
login route from the validated provider, canonical resource and scopes. It
never follows a URL supplied by an arbitrary error body.

`loginHref(provider, { returnTo, resource?, scopes? })` creates the server's
`/auth/login/:provider` URL with one `returnTo`, optional `resource` and repeated
sorted unique `scope` fields. `returnTo` must be a local absolute path; its query
and fragment are preserved. A resource-less link requests identity login only.
Incremental API consent includes the canonical resource returned by the server.
The provider engine resolves resource-less token acquisition only when exactly
one explicit API resource is configured; it never infers a resource from scope
spelling.

## Qualification boundary

Core owns the binding, retirement, hydration and native browser behavior. The
complete packed Core/Auth/Server SSR-to-SPA provider flow is qualified in the
Examples consumer graph, avoiding a Core-to-Server development cycle. Simulated
provider qualification does not establish live vendor compatibility; the
provider support matrix records live checks separately.
