# Route authoring ownership

`router/authoring.ts` retains the public overloads, component/path type inference,
execution-model restrictions and typed route references. Its implementations
delegate to three private modules; none is a package entrypoint.

| Owner                   | Responsibility                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `path-policy.ts`        | Validate parameter syntax and normalize/join paths without consulting a registration table.                                                                       |
| `registration-scope.ts` | Resolve paths against the active scope and capture group/page inheritance. Scope push/pop remains owned by the table in `store.ts`.                               |
| `route-registration.ts` | Validate record eligibility, compose inherited auth/policies/metadata, reject duplicate match keys, construct handlers and publish records into the active table. |

Scope callbacks remain synchronous. A throwing definition unwinds every scope
through `store.ts`'s `finally` blocks. Records registered before that exception
remain registered; route definitions are not transactions. A later root route
must not inherit the failed definition's path, layout, page, auth or metadata.

All leaf registration helpers (`route`, `index`, `fallback`) must respect the
active table's startup lock and accept only component functions. A fresh
`createRouteRegistry` uses its own unlocked table. `index` reserves its page's
single index slot only after the record is successfully registered.

Fallback paths use the same join rules as relative leaf paths. In particular,
`page('/', Page, ...)` owns `/*`, with `/` as its fallback prefix and `Page` in
its page chain. Nested-group fallback restrictions and inherited auth denial
order are unchanged.

The architecture tests enforce the dependency direction: path policy cannot
read the table; scope capture cannot publish records; record registration cannot
import the public facade. Unit probes exercise these seams alongside the
existing manifest, matching, auth, metadata and jsdom navigation suites.
