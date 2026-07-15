import { expectAssignable, expectError, expectType } from 'tsd';
import { schema } from '@askrjs/schema';
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
