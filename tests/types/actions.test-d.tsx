import { expectAssignable, expectError, expectType } from 'tsd';
import { schema } from '@askrjs/schema';
import type { JSX } from '@askrjs/askr/jsx-runtime';
import {
  ActionForm,
  action,
  defineAction,
  type ActionDescriptor,
  type ActionStatus,
} from '@askrjs/askr/actions';

const rename = defineAction({
  id: 'rename-project',
  input: schema.object({ name: schema.string({ minLength: 2 }) }),
  invalidates: ['projects'],
});
expectError(defineAction({ id: 'scalar', input: schema.string() }));

expectAssignable<ActionDescriptor<{ name: string }>>(rename);
expectAssignable<JSX.Element>(
  <ActionForm action={rename} onSubmit={(_event: Event) => undefined}>
    <input name="name" />
  </ActionForm>
);

const command = action<{ name: string }, { id: string }>(rename);
expectType<ActionStatus<{ id: string }>>(command.state());
expectType<Promise<{ id: string }>>(command.submit({ name: 'Askr' }));

const explicitCsrf = action<{ name: string }, { id: string }>(rename, {
  csrfToken: async (signal) => {
    expectType<AbortSignal>(signal);
    return 'current-session-token';
  },
});
expectType<Promise<{ id: string }>>(explicitCsrf.submit({ name: 'Askr' }));
expectAssignable<ReturnType<typeof action<{ name: string }>>>(
  action(rename, { csrfToken: async () => undefined })
);
expectError(action(rename, { csrfToken: 'static-token' }));
expectError(action(rename, { csrfToken: async () => 42 }));
expectError(action(rename, { csrfToken: () => 'sync-token' }));
expectError(action(rename, { csrfToken: async (_signal: string) => 'token' }));
// The CSRF token is read at submit from the hydration envelope, a meta tag or
// a cookie when no resolver is given, so an empty options object is valid.
expectAssignable<ReturnType<typeof action<{ name: string }>>>(
  action(rename, {})
);
expectError(
  action(rename, { csrfToken: async () => 'token', transport: fetch })
);
