# Stable IDs for labels and descriptions

Require an application-owned `id` prop when a reusable component needs an
`htmlFor`, `aria-labelledby` or `aria-describedby` association. Derive related
IDs from that input. Pass exactly the same identity during server rendering and
hydration.

```tsx
interface NameFieldProps {
  id: string;
  label: string;
  description: string;
}

function NameField(props: NameFieldProps) {
  const labelId = `${props.id}-label`;
  const descriptionId = `${props.id}-description`;
  return (
    <div>
      <label id={labelId} htmlFor={props.id}>
        {props.label}
      </label>
      <input
        id={props.id}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
      />
      <p id={descriptionId}>{props.description}</p>
    </div>
  );
}

// The application chooses a stable root/instance namespace and public record key.
const id = `profile-main:${encodeURIComponent(record.id)}:display-name`;
const field = (
  <NameField id={id} label="Display name" description="Shown to teammates" />
);
```

The application must choose a nonempty, whitespace-free ID that is unique in
the document. A second instance for the same record needs a different stable
instance namespace, such as `profile-sidebar`. Separate roots share a document
and need distinct namespaces too. Reserve the component's `-label` and
`-description` suffixes for that component's own elements. Encode variable key
segments consistently so delimiters cannot make two identities ambiguous.

Use a stable domain or instance key when rendering a keyed list. Reordering the
list must preserve the ID assigned to each record. Array positions only provide
that identity if the application guarantees that positions never change.

## Server rendering and hydration

Build the route registry with the same public identity inputs on the server and
in the browser. Transport server-derived public keys through your existing
loader or boot-data contract; this pattern adds no automatic serialization.
Never put credentials or secret values into IDs, which are visible in HTML.

```tsx
import { hydrateSPA } from '@askrjs/askr/boot';
import { createRouteRegistry, route } from '@askrjs/askr/router';
import { renderToString } from '@askrjs/askr/ssr';

function createRegistry(instanceId: string) {
  return createRouteRegistry(() =>
    route('/settings', () => (
      <NameField
        id={instanceId}
        label="Display name"
        description="Shown to teammates"
      />
    ))
  );
}

// Server: instanceId comes from the application's public request inputs.
const html = renderToString({
  url: '/settings',
  registry: createRegistry(instanceId),
});
// Browser: the root already contains html, and instanceId is the same public value.
await hydrateSPA({
  root: document.getElementById('app')!,
  registry: createRegistry(instanceId),
  hydrate: { verifyMarkup: true },
});
```

Matching inputs preserve the server's control nodes and their associations.
Different server/client IDs are a hydration mismatch when markup verification
is enabled. Random IDs generated separately on the server and browser, module
counters and render-order counters do not establish this contract. A component
shown only after hydration can use the same explicit namespace/key pattern.

Core does not export an automatic application ID allocator. Renderer keys and
UI's internal composite IDs are separate implementation details. An explicit
input keeps identity stable across repeated SSR requests, independent roots,
rerenders and keyed reordering.

The public-only installed consumer tests execute SSR, verified hydration,
retained node/ID identity, label control and ARIA targets, reverse SSR completion,
two roots and an intentional mismatch. Native browser tests also exercise label
focus, accessible name/description and editing after hydration.

See [Forms](./forms.md) and [SSR](./ssr.md).
