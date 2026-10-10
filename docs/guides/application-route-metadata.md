# Application route metadata

`appMeta` holds application-owned declaration data such as breadcrumbs and
required display grants. It is separate from document/head `meta`, loader data,
and history `state`. The router does not aggregate or interpret its values.

```tsx
import {
  createRouteRegistry,
  currentRoute,
  group,
  Outlet,
  page,
  route,
} from '@askrjs/askr/router';
import { createQuery } from '@askrjs/askr/data';

interface AppMeta {
  readonly breadcrumb?: string;
  readonly requiredGrants?: readonly string[];
}
const reports = {
  breadcrumb: 'Reports',
  requiredGrants: ['reports:read'],
} satisfies AppMeta;
const detail = {
  breadcrumb: 'Detail',
  requiredGrants: ['report:read'],
} satisfies AppMeta;

async function fetchGrants({ signal }: { signal: AbortSignal }) {
  const response = await fetch('/api/session/grants', { signal });
  if (!response.ok) throw new Error('Grants unavailable');
  const data: { grants: string[] } = await response.json();
  if (
    !Array.isArray(data.grants) ||
    data.grants.some((grant) => typeof grant !== 'string')
  ) {
    throw new Error('Invalid grants response');
  }
  return data;
}

function Report() {
  const active = currentRoute<{ id: string }, unknown, AppMeta>();
  const grants = createQuery({ key: 'session:grants', fetch: fetchGrants });
  const requirements = active.matches.flatMap(
    (entry) => entry.appMeta?.requiredGrants ?? []
  );
  if (grants.loading || grants.refreshing) return <p>Checking access...</p>;
  if (grants.error) return <p>Access information unavailable</p>;
  if (!requirements.every((grant) => grants.data?.grants.includes(grant))) {
    return <p>This view is unavailable</p>;
  }
  return <h1>Report {active.params.id}</h1>;
}

export const registry = createRouteRegistry(() => {
  group({ appMeta: reports }, () => {
    page(
      '/reports',
      () => <Outlet />,
      () => {
        route('{id}', Report, { appMeta: detail });
      }
    );
  });
});
```

The application aggregates requirements from the outer declaration to the leaf.
Its grants query must be refreshed or invalidated when identity/grants change.
An unresolved, failed or refreshing result withholds the view, and a successful
revocation hides it while the route stays active. Use an explicit app data
runtime when mounting so independently owned apps do not share grants state.
This is reactive display gating: native `auth`/`policies` still govern navigation,
and servers must authorize each protected operation. A metadata string does not
authorize a request or continuously rerun a navigation policy.

`satisfies AppMeta` checks each declaration. Typed option interfaces and appended
read generics are available in the router reference. The registry is opaque;
its callback does not infer a global metadata schema. Default reads are
`unknown`, and an explicit read generic is the application's declared schema.

Each matched record owns its captured ancestry. Metadata-bearing group/page
declarations appear in order, followed by the leaf even when it has no metadata.
Multiple groups at one prefix remain separate entries. `page()` supplies its
template prefix; a group uses the current prefix (`/` at the root). Each match
carries the leaf's full parameter record. `matchRoute()` returns the leaf;
ancestors do not change exact activity matching. Existing registries without
application metadata keep their single leaf match.

Registration copies and deeply freezes ordinary record/array data and primitive
values, including cyclic graphs. It does not freeze caller-owned inputs or run
functions/getters. Accessors, functions and class instances such as `Map`, `Set`
and `Date` throw a corrective `TypeError`. `undefined` means no declaration;
`null`, `false`, zero and the empty string are retained. Store reactive values in
their data owner, rather than mutating declarations.

SSR reads the request's registry and preserves the same ancestry, including
independent registries with identical paths. `appMeta` is not automatically
serialized into hydration data, history state, head metadata, or loader data.
If an application explicitly renders or serializes a value, that is its own
transport decision. Metadata declared in browser route source is visible in
the browser bundle; do not put secrets in client registries.
