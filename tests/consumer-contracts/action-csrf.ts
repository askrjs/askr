import { action, type ActionDescriptor } from '@askrjs/askr/actions';

declare const save: ActionDescriptor<{ name: string }>;
const command = action<{ name: string }, { saved: boolean }>(save, {
  csrfToken: async (signal) => {
    signal.throwIfAborted();
    return 'opaque-token';
  },
});
command.submit({ name: 'Askr' }) satisfies Promise<{ saved: boolean }>;
action(save, { csrfToken: async () => undefined });
// @ts-expect-error An explicit asynchronous resolver is required.
action(save, { csrfToken: 'static' });
// @ts-expect-error Token results must be strings or undefined.
action(save, { csrfToken: async () => 1 });
// @ts-expect-error No ad-hoc action transport override is exposed.
action(save, { csrfToken: async () => 'token', fetch });
